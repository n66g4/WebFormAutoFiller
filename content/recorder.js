(function () {
  if (window.__wffRecorder) {
    return;
  }

  const SKIP_TAGS = new Set(['script', 'style', 'meta', 'link', 'svg', 'path']);
  const SKIP_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image']);

  const state = {
    active: false,
    fields: [],
    hovered: null,
    baseConfig: null
  };

  function isFillableElement(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    const tag = el.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) return false;
    if (tag === 'input') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (SKIP_INPUT_TYPES.has(type)) return false;
    }
    return ['input', 'textarea', 'select'].includes(tag) || el.isContentEditable;
  }

  function findFillableTarget(el) {
    let current = el;
    while (current && current !== document.body) {
      if (current.matches('.el-form-item__label, .ant-form-item-label')) {
        const forId = current.getAttribute('for');
        if (forId) {
          const target = document.getElementById(forId);
          if (target) {
            if (target.matches('.el-radio-group, .ant-radio-group, .ivu-radio-group, .arco-radio-group, [role="radiogroup"]')) {
              return target;
            }
            if (typeof WebFormFieldType !== 'undefined') {
              const radioRoot = WebFormFieldType.findRadioGroupRoot(target, document);
              if (radioRoot) return radioRoot;
            }
          }
        }
      }

      if (current.matches('.el-radio-group, .ant-radio-group, .ivu-radio-group, .arco-radio-group, [role="radiogroup"]')) return current;
      if (current.matches('.el-checkbox-group, .ant-checkbox-group')) return current;
      if (current.matches('.el-select, .ant-select')) return current;
      if (current.matches('.el-date-editor, .ant-picker, .el-date-picker')) return current;
      if (isFillableElement(current)) {
        if (typeof WebFormFieldType !== 'undefined') {
          const radioGroup = WebFormFieldType.findRadioGroupRoot(current, document);
          if (radioGroup) return radioGroup;
        }
        const radioGroup = current.closest('.el-radio-group, .ant-radio-group, .ivu-radio-group, .arco-radio-group, [role="radiogroup"]');
        if (radioGroup) return radioGroup;
        const checkboxGroup = current.closest('.el-checkbox-group, .ant-checkbox-group');
        if (checkboxGroup) return checkboxGroup;
        const uiSelect = current.closest('.el-select, .ant-select');
        if (uiSelect) return uiSelect;
        const dateRoot = current.closest('.el-date-editor, .ant-picker, .el-date-picker');
        if (dateRoot) return dateRoot;
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  function getSampleValue(el) {
    if (el.matches('.el-radio-group, .ant-radio-group, .ivu-radio-group, .arco-radio-group, [role="radiogroup"]')) {
      if (typeof WebFormFieldType !== 'undefined') {
        return WebFormFieldType.collectRadioOptions(el, document).join(',') || '选项1';
      }
      const checked = el.querySelector('input[type="radio"]:checked');
      if (checked) {
        const label = checked.closest('label');
        const span = label?.querySelector('.el-radio__label, .el-radio-button__inner');
        return WebFormLocator.normalizeLabelText(span?.textContent || label?.textContent || checked.value);
      }
      const first = el.querySelector('input[type="radio"]');
      if (first) {
        const label = first.closest('label');
        const span = label?.querySelector('.el-radio__label, .el-radio-button__inner');
        return WebFormLocator.normalizeLabelText(span?.textContent || label?.textContent || first.value);
      }
      return '是';
    }

    if (el.matches('.el-checkbox-group, .ant-checkbox-group')) {
      const checked = Array.from(el.querySelectorAll('input[type="checkbox"]:checked'));
      if (checked.length) {
        return checked.map((box) => {
          const label = box.closest('label');
          const span = label?.querySelector('.el-checkbox__label, .el-checkbox-button__inner');
          return WebFormLocator.normalizeLabelText(span?.textContent || label?.textContent || box.value);
        }).join(',');
      }
      const first = el.querySelector('input[type="checkbox"]');
      if (first) {
        const label = first.closest('label');
        const span = label?.querySelector('.el-checkbox__label, .el-checkbox-button__inner');
        return WebFormLocator.normalizeLabelText(span?.textContent || label?.textContent || first.value);
      }
      return '选项1,选项2';
    }

    if (el.matches('.el-select, .ant-select')) {
      const input = el.querySelector('input');
      const selected = el.querySelector('.el-select__selected-item, .el-select__placeholder, .ant-select-selection-item');
      return input?.value || WebFormLocator.normalizeLabelText(selected?.textContent) || '选项1';
    }

    if (el.matches('.el-date-editor, .ant-picker, .el-date-picker')) {
      const input = el.querySelector('input');
      return input?.value || '2024-01-01';
    }

    const tag = el.tagName.toLowerCase();
    if (tag === 'select') {
      return el.options[el.selectedIndex]?.text || el.value || '';
    }
    if (tag === 'input') {
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (type === 'checkbox') return el.checked ? '是' : '否';
    }
    return el.value || el.textContent?.trim() || '';
  }

  function loadFieldsFromConfig(config) {
    if (!config || !config.mappings) return [];

    return Object.entries(config.mappings).map(([key, label]) => ({
      key,
      label,
      locator: config.fieldMappings?.[label] || null,
      fieldMeta: config.fieldMeta?.[key] || null,
      isExisting: true
    })).filter((field) => field.locator);
  }

  function injectStyles() {
    if (document.getElementById('__wff-recorder-css')) return;
    const link = document.createElement('link');
    link.id = '__wff-recorder-css';
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('content/recorder.css');
    document.head.appendChild(link);
  }

  function createUI() {
    if (document.getElementById('__wff-recorder-root')) return;

    const root = document.createElement('div');
    root.id = '__wff-recorder-root';

    const bar = document.createElement('div');
    bar.id = '__wff-recorder-bar';
    bar.innerHTML = `
      <span id="__wff-recorder-status">录制中：点击页面表单字段</span>
      <button type="button" class="wff-btn-finish" id="__wff-btn-finish">完成 (${state.fields.length})</button>
      <button type="button" class="wff-btn-cancel" id="__wff-btn-cancel">取消</button>
    `;

    const panel = document.createElement('div');
    panel.id = '__wff-recorder-panel';
    const modeHint = state.baseConfig
      ? `追加到：${state.baseConfig.name}`
      : '新建配置';
    panel.innerHTML = `
      <div class="wff-panel-header">${modeHint} (<span id="__wff-field-count">0</span> 个字段)</div>
      <div class="wff-field-list" id="__wff-field-list"></div>
      <div class="wff-panel-hint">点击表单字段添加映射，自动识别单选/多选/下拉/日期等类型。</div>
    `;

    root.appendChild(bar);
    root.appendChild(panel);
    document.body.appendChild(root);

    document.getElementById('__wff-btn-finish').addEventListener('click', showFinishDialog);
    document.getElementById('__wff-btn-cancel').addEventListener('click', () => stop(false));
  }

  function updateUI() {
    const countEl = document.getElementById('__wff-field-count');
    const finishBtn = document.getElementById('__wff-btn-finish');
    const statusEl = document.getElementById('__wff-recorder-status');
    if (countEl) countEl.textContent = state.fields.length;
    if (finishBtn) finishBtn.textContent = `完成 (${state.fields.length})`;
    if (statusEl) {
      statusEl.textContent = state.fields.length
        ? `录制中：已捕获 ${state.fields.length} 个字段`
        : '录制中：点击页面表单字段';
    }
    renderFieldList();
  }

  function renderFieldList() {
    const list = document.getElementById('__wff-field-list');
    if (!list) return;

    list.innerHTML = '';
    state.fields.forEach((field, index) => {
      const item = document.createElement('div');
      item.className = 'wff-field-item' + (field.isExisting ? ' wff-field-existing' : '');
      item.innerHTML = `
        <button type="button" class="wff-field-remove" data-index="${index}" title="移除">×</button>
        <div class="wff-field-label">${field.isExisting ? '已有 · ' : ''}${field.label}</div>
        <div class="wff-field-locator">${WebFormLocator.locatorToString(field.locator)}</div>
        <div class="wff-field-locator">${field.fieldMeta?.type || 'text'}${field.fieldMeta?.options?.length ? ` · ${field.fieldMeta.options.length} 项` : ''}</div>
      `;
      item.querySelector('.wff-field-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        state.fields.splice(index, 1);
        updateUI();
      });
      list.appendChild(item);
    });
  }

  function locatorsMatch(a, b) {
    const la = WebFormLocator.toLocator(a);
    const lb = WebFormLocator.toLocator(b);
    return la.primary === lb.primary && la.fallback === lb.fallback;
  }

  function addField(element) {
    const locator = WebFormLocator.buildLocator(element, document);
    const existing = state.fields.findIndex((f) => locatorsMatch(f.locator, locator));
    if (existing >= 0) {
      flashMessage(`字段已存在: ${state.fields[existing].label}`);
      return;
    }

    const label = WebFormDomLabel.findLabel(element, document)
      || element.getAttribute('placeholder')
      || element.getAttribute('name')
      || element.id
      || `字段 ${state.fields.length + 1}`;

    const defaultLabel = label.trim();
    const labelExists = state.fields.some((f) => f.label === defaultLabel);
    const userLabel = prompt(
      labelExists ? '字段名称（中文，不能与已有字段重复）:' : '字段名称（中文）:',
      defaultLabel
    );
    if (userLabel === null) return;
    if (!userLabel.trim()) {
      flashMessage('已取消：字段名称不能为空');
      return;
    }
    if (state.fields.some((f) => f.label === userLabel.trim())) {
      flashMessage('字段名称已存在，请使用其他名称');
      return;
    }

    const fieldMeta = typeof WebFormFieldType !== 'undefined'
      ? WebFormFieldType.detectFromElement(element, document)
      : { type: 'text', options: [] };

    state.fields.push({
      label: userLabel.trim(),
      locator,
      fieldMeta,
      sampleValue: getSampleValue(element),
      isExisting: false
    });

    element.classList.add('__wff-recorder-highlight');
    updateUI();
    flashMessage(`已添加: ${userLabel.trim()}`);
  }

  function flashMessage(text) {
    const statusEl = document.getElementById('__wff-recorder-status');
    if (!statusEl) return;
    const prev = statusEl.textContent;
    statusEl.textContent = text;
    setTimeout(() => updateUI(), 2000);
  }

  function onMouseOver(e) {
    if (!state.active) return;
    const target = findFillableTarget(e.target);
    if (state.hovered && state.hovered !== target) {
      state.hovered.classList.remove('__wff-recorder-hover');
    }
    if (target && !target.closest('#__wff-recorder-root') && !target.closest('#__wff-recorder-finish')) {
      target.classList.add('__wff-recorder-hover');
      state.hovered = target;
    }
  }

  function onMouseOut(e) {
    if (!state.active) return;
    const target = findFillableTarget(e.target);
    if (target) target.classList.remove('__wff-recorder-hover');
  }

  function onClick(e) {
    if (!state.active) return;
    if (e.target.closest('#__wff-recorder-root') || e.target.closest('#__wff-recorder-finish') || e.target.closest('#__wff-recorder-overlay')) {
      return;
    }

    const target = findFillableTarget(e.target);
    if (!target) return;

    e.preventDefault();
    e.stopPropagation();
    addField(target);
  }

  function buildConfigFromFields(name, description, urlPattern) {
    const mappings = {};
    const fieldMappings = {};
    const fieldMeta = { ...(state.baseConfig?.fieldMeta || {}) };
    const usedKeys = new Set();

    state.fields.forEach((field) => {
      if (field.isExisting && field.key) {
        mappings[field.key] = field.label;
        fieldMappings[field.label] = WebFormLocator.locatorToStorage(field.locator);
        if (field.fieldMeta) fieldMeta[field.key] = field.fieldMeta;
        usedKeys.add(field.key);
      }
    });

    state.fields.filter((field) => !field.isExisting).forEach((field, index) => {
      let key = WebFormFieldKey.generate(field.label, index);
      const originalKey = key;
      let suffix = 1;
      while (usedKeys.has(key)) {
        key = `${originalKey}${suffix}`;
        suffix++;
      }
      usedKeys.add(key);
      mappings[key] = field.label;
      fieldMappings[field.label] = WebFormLocator.locatorToStorage(field.locator);
      fieldMeta[key] = field.fieldMeta || { type: 'text', options: [] };
    });

    if (state.baseConfig) {
      return {
        ...state.baseConfig,
        name: state.baseConfig.name,
        description: state.baseConfig.description,
        urlPattern: urlPattern || state.baseConfig.urlPattern || undefined,
        mappings,
        fieldMappings,
        fieldMeta
      };
    }

    const configId = WebFormFieldKey.generateConfigId(name);
    return {
      id: configId,
      name,
      description: description || `用于填充${name}相关表单`,
      urlPattern: urlPattern || undefined,
      mappings,
      outputFormat: 'json',
      errorHandling: { logErrors: true, errorMessage: '处理数据时发生错误' },
      fieldMappings,
      fieldMeta
    };
  }

  function showFinishDialog() {
    if (state.fields.length === 0) {
      flashMessage('请至少保留或录制一个字段');
      return;
    }

    const newFieldCount = state.fields.filter((f) => !f.isExisting).length;
    if (state.baseConfig && newFieldCount === 0) {
      flashMessage('请至少录制一个新字段，或取消录制');
      return;
    }

    state.active = false;

    const overlay = document.createElement('div');
    overlay.id = '__wff-recorder-overlay';

    const dialog = document.createElement('div');
    dialog.id = '__wff-recorder-finish';

    if (state.baseConfig) {
      dialog.innerHTML = `
        <h3>追加字段到配置</h3>
        <p style="font-size:12px;color:#4a5568;margin-bottom:12px;">
          将向「${state.baseConfig.name}」追加 ${newFieldCount} 个新字段（共 ${state.fields.length} 个）
        </p>
        <label>配置名称</label>
        <input type="text" id="__wff-config-name" value="${state.baseConfig.name}" disabled>
        <label>页面 URL（可选）</label>
        <input type="text" id="__wff-url-pattern" value="${state.baseConfig.urlPattern || (location.origin + location.pathname)}">
        <div class="wff-finish-actions">
          <button type="button" class="wff-btn-back" id="__wff-btn-back">继续录制</button>
          <button type="button" class="wff-btn-save" id="__wff-btn-save">保存到扩展</button>
        </div>
      `;
    } else {
      dialog.innerHTML = `
        <h3>保存录制配置</h3>
        <label>配置名称</label>
        <input type="text" id="__wff-config-name" placeholder="例如：审批表单配置">
        <label>配置描述（可选）</label>
        <textarea id="__wff-config-desc" placeholder="用于填充..."></textarea>
        <label>页面 URL 匹配（可选，便于识别）</label>
        <input type="text" id="__wff-url-pattern" value="${location.origin}${location.pathname}">
        <div class="wff-finish-actions">
          <button type="button" class="wff-btn-back" id="__wff-btn-back">继续录制</button>
          <button type="button" class="wff-btn-save" id="__wff-btn-save">保存到扩展</button>
        </div>
      `;
    }

    document.body.appendChild(overlay);
    document.body.appendChild(dialog);

    document.getElementById('__wff-btn-back').addEventListener('click', () => {
      overlay.remove();
      dialog.remove();
      state.active = true;
    });

    document.getElementById('__wff-btn-save').addEventListener('click', async () => {
      const nameEl = document.getElementById('__wff-config-name');
      const descEl = document.getElementById('__wff-config-desc');
      const urlEl = document.getElementById('__wff-url-pattern');

      const name = nameEl ? nameEl.value.trim() : '';
      const description = descEl ? descEl.value.trim() : '';
      const urlPattern = urlEl ? urlEl.value.trim() : '';

      if (!state.baseConfig && !name) {
        alert('请填写配置名称');
        return;
      }

      const config = buildConfigFromFields(name, description, urlPattern);

      try {
        const response = await chrome.runtime.sendMessage({
          action: 'SAVE_RECORDED_CONFIG',
          config
        });
        if (response && response.ok) {
          const msg = state.baseConfig
            ? `已向「${config.name}」追加 ${newFieldCount} 个字段`
            : `配置「${config.name}」已保存，可在扩展 popup 中使用`;
          alert(msg);
          cleanup();
        } else {
          alert('保存失败: ' + (response?.error || '未知错误'));
          overlay.remove();
          dialog.remove();
          state.active = true;
        }
      } catch (err) {
        alert('保存失败: ' + err.message);
        overlay.remove();
        dialog.remove();
        state.active = true;
      }
    });
  }

  function cleanup() {
    state.active = false;
    state.baseConfig = null;
    document.removeEventListener('mouseover', onMouseOver, true);
    document.removeEventListener('mouseout', onMouseOut, true);
    document.removeEventListener('click', onClick, true);

    document.querySelectorAll('.__wff-recorder-highlight, .__wff-recorder-hover').forEach((el) => {
      el.classList.remove('__wff-recorder-highlight', '__wff-recorder-hover');
    });

    document.getElementById('__wff-recorder-root')?.remove();
    document.getElementById('__wff-recorder-finish')?.remove();
    document.getElementById('__wff-recorder-overlay')?.remove();
    document.getElementById('__wff-recorder-css')?.remove();

    delete window.__wffRecorder;
  }

  function stop(saved) {
    if (!saved) cleanup();
  }

  function start(options = {}) {
    if (state.active) {
      cleanup();
    }

    state.active = true;
    state.baseConfig = options.baseConfig || null;
    state.fields = loadFieldsFromConfig(state.baseConfig);
    injectStyles();
    createUI();
    updateUI();

    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('mouseout', onMouseOut, true);
    document.addEventListener('click', onClick, true);
  }

  window.__wffRecorder = { start, stop, cleanup };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'START_RECORDING') {
      start({ baseConfig: message.baseConfig || null });
      sendResponse({ ok: true, appendMode: !!message.baseConfig });
    } else if (message.action === 'STOP_RECORDING') {
      cleanup();
      sendResponse({ ok: true });
    } else if (message.action === 'GET_RECORDING_STATUS') {
      sendResponse({
        active: state.active,
        fieldCount: state.fields.length,
        appendMode: !!state.baseConfig
      });
    }
    return true;
  });
})();
