// 全局变量
let configsIndex = null;
let currentConfig = null;
let lastFillResult = null;
let lastLiveMeta = {};

document.addEventListener('DOMContentLoaded', () => {
  init();
});

async function init() {
  setupConfigParserLink();
  setupSavedConfigs();
  setupConfigTypeActions();
  setupConfigSelectListener();
  setupRecording();
  setupDiagnostics();

  await loadConfigsIndex();
  await loadSavedConfigsList();
  await updateSubmitButtonState();
  await updateRecordingButtonState();
}

function setupConfigParserLink() {
  const link = document.getElementById('configParserLink');
  if (link && chrome.runtime) {
    link.href = chrome.runtime.getURL('config-parser.html');
  }
}

function setupConfigSelectListener() {
  const select = document.getElementById('configSelect');
  if (select) {
    select.addEventListener('change', (e) => {
      updateConfigDescription(e.target.value);
      updateRecordingButtonLabel();
    });
  }
}

function getFieldMeta(key, chineseName, liveMeta = null) {
  let meta = WebFormFieldType.resolveMeta(currentConfig, key, chineseName);
  const live = liveMeta?.[chineseName] || liveMeta?.[key];

  if (live) {
    if (live.type === WebFormFieldType.TYPES.RADIO && meta.type === WebFormFieldType.TYPES.DATE) {
      // 页面误识别为单选时，保留配置中的日期类型
    } else if (live.options?.length) {
      meta = { type: live.type || meta.type, options: live.options };
    } else if (live.type && live.type !== WebFormFieldType.TYPES.TEXT) {
      meta = { ...meta, type: live.type };
    }
  }

  if (
    !meta.options?.length
    && meta.type === WebFormFieldType.TYPES.RADIO
    && /是否|有没有|是否为|与否/.test(chineseName)
  ) {
    meta = { ...meta, options: ['是', '否'] };
  }

  if (meta.options?.length && currentConfig) {
    if (!currentConfig.fieldMeta) currentConfig.fieldMeta = {};
    currentConfig.fieldMeta[key] = {
      type: meta.type,
      options: meta.options
    };
  }

  return meta;
}

async function fetchLiveFieldMetaFromPage() {
  const tab = await getActiveTab();
  if (!tab || !isFillableUrl(tab.url) || !currentConfig?.mappings) {
    return {};
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ['shared/field-type.js']
    });

    const frameResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: (mappings, fieldMappings, fieldMeta) => {
        const docs = WebFormFieldType.getSearchableDocuments(document);
        const out = {};

        Object.entries(mappings).forEach(([key, label]) => {
          const locator = fieldMappings[label];
          const configMeta = fieldMeta?.[key] || null;
          let best = null;

          for (const doc of docs) {
            const meta = WebFormFieldType.probeFieldMeta(label, locator, doc, configMeta);
            if (meta.options?.length) {
              best = meta;
              break;
            }
            if (!best && meta.type !== WebFormFieldType.TYPES.TEXT) {
              best = meta;
            }
          }

          if (best) {
            out[label] = best;
            out[key] = best;
          }
        });

        return out;
      },
      args: [currentConfig.mappings, currentConfig.fieldMappings, currentConfig.fieldMeta || {}]
    });

    const liveMeta = {};
    frameResults.forEach((frame) => {
      const partial = frame?.result || {};
      Object.entries(partial).forEach(([key, meta]) => {
        if (!liveMeta[key] || (meta.options?.length && !liveMeta[key].options?.length)) {
          liveMeta[key] = meta;
        }
      });
    });

    return liveMeta;
  } catch (error) {
    console.warn('从页面读取字段选项失败:', error);
    return {};
  }
}

function getPopupFieldStates() {
  const states = [];
  document.querySelectorAll('#formFields .form-field').forEach((fieldDiv) => {
    const key = fieldDiv.dataset.fieldKey;
    if (!key) return;
    states.push({
      key,
      label: currentConfig?.mappings?.[key] || key,
      popupType: fieldDiv.dataset.fieldType || 'text',
      hasRadioUi: !!fieldDiv.querySelector('.choice-group-radio'),
      hasSelectUi: !!fieldDiv.querySelector('select'),
      hasTextFallback: !!fieldDiv.querySelector('.field-hint'),
      valuePreview: collectFormData()[key] || ''
    });
  });
  return states;
}

async function collectDiagnosticsReport() {
  const tab = await getActiveTab();
  const report = {
    generatedAt: new Date().toISOString(),
    extensionVersion: chrome.runtime.getManifest().version,
    tab: tab ? { url: tab.url, title: tab.title } : null,
    config: currentConfig ? {
      id: currentConfig.id,
      name: currentConfig.name,
      mappings: currentConfig.mappings,
      fieldMeta: currentConfig.fieldMeta || {},
      fieldMappings: currentConfig.fieldMappings || {}
    } : null,
    popupFields: getPopupFieldStates(),
    liveMeta: lastLiveMeta,
    lastFillResult,
    pageProbe: null,
    errors: []
  };

  if (!tab || !isFillableUrl(tab.url)) {
    report.errors.push('当前标签页不是可填充页面，请打开目标表单页后重试');
    return report;
  }

  if (!currentConfig?.mappings) {
    report.errors.push('未选择配置');
    return report;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ['shared/field-type.js', 'shared/diagnostics.js']
    });

    const frameResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: (mappings, fieldMappings, fieldMeta) => {
        return WebFormDiagnostics.diagnoseAll(mappings, fieldMappings, fieldMeta);
      },
      args: [currentConfig.mappings, currentConfig.fieldMappings, currentConfig.fieldMeta || {}]
    });

    report.pageProbe = frameResults
      .map((frame) => ({
        frameId: frame.frameId,
        ...(frame.result || {})
      }))
      .filter((item) => item.summary || item.documents);
  } catch (error) {
    report.errors.push(`页面探测失败: ${error.message}`);
  }

  return report;
}

function formatDiagnosticsReport(report) {
  const lines = [];
  lines.push('=== WebFormAutoFiller 诊断报告 ===');
  lines.push(`时间: ${report.generatedAt}`);
  lines.push(`版本: ${report.extensionVersion}`);
  lines.push(`页面: ${report.tab?.url || '无'}`);
  lines.push(`配置: ${report.config?.name || '无'} (${report.config?.id || '-'})`);
  lines.push('');

  if (report.errors.length) {
    lines.push('--- 错误 ---');
    report.errors.forEach((err) => lines.push(`- ${err}`));
    lines.push('');
  }

  lines.push('--- Popup 字段状态 ---');
  report.popupFields.forEach((field) => {
    lines.push(
      `[${field.key}] ${field.label} | type=${field.popupType} | radioUI=${field.hasRadioUi} | textFallback=${field.hasTextFallback} | value=${field.valuePreview || '(空)'}`
    );
  });
  lines.push('');

  if (report.lastFillResult) {
    lines.push('--- 上次填充结果 ---');
    const r = report.lastFillResult;
    lines.push(`成功 ${r.successCount} / 失败 ${r.errorCount}`);
    [...(r.errors || []), ...(r.skipped || [])].forEach((item) => {
      lines.push(`  ${item.field}: ${item.reason}`);
    });
    lines.push('');
  }

  report.pageProbe?.forEach((frame) => {
    lines.push(`--- 页面探测 frameId=${frame.frameId} ---`);
    lines.push(`URL: ${frame.pageUrl || frame.doc || '-'}`);
    frame.summary?.forEach((field) => {
      lines.push(`字段: ${field.label} (${field.key})`);
      lines.push(`  配置 fieldMeta: ${JSON.stringify(field.configMeta)}`);
      lines.push(`  探测 probedMeta: ${JSON.stringify(field.probedMeta)}`);
      lines.push(`  选项(span): ${(field.optionLabelsFromSpans || []).join(', ') || '(无)'}`);
      lines.push(`  匹配表单项数: ${field.matchedFormItemCount}`);
      if (field.issues?.length) {
        lines.push(`  问题: ${field.issues.join('；')}`);
      }

      const detail = frame.documents
        ?.flatMap((doc) => doc.fields || [])
        .find((f) => f.key === field.key);
      if (detail?.matchedFormItems?.length) {
        detail.matchedFormItems.forEach((item, index) => {
          lines.push(`  表单项#${index + 1}: label="${item.labelText}" radio=${item.hasRadioGroup} options=${(item.radioLabels || []).join(', ')}`);
        });
      }
      if (detail?.steps?.length) {
        detail.steps.forEach((step) => {
          lines.push(`  步骤 ${step.step}: found=${step.found} ${step.element ? JSON.stringify(step.element) : ''}`);
        });
      }
    });
    lines.push('');
  });

  lines.push('--- JSON（完整数据）---');
  lines.push(JSON.stringify(report, null, 2));
  return lines.join('\n');
}

function setupDiagnostics() {
  const btn = document.getElementById('copyDiagnosticsBtn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const output = document.getElementById('diagnosticsOutput');
    btn.disabled = true;
    const prevText = btn.textContent;
    btn.textContent = '生成中…';

    try {
      const report = await collectDiagnosticsReport();
      const text = formatDiagnosticsReport(report);
      if (output) {
        output.hidden = false;
        output.value = text;
      }
      try {
        await navigator.clipboard.writeText(text);
        showMessage('诊断日志已复制到剪贴板', 'success');
      } catch (clipboardError) {
        if (output) output.select();
        showMessage('日志已生成，请手动复制下方文本框内容', 'info');
      }
    } catch (error) {
      console.error('生成诊断日志失败:', error);
      showMessage('生成诊断日志失败: ' + error.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = prevText;
    }
  });
}

function parseSavedMultiValue(value) {
  if (Array.isArray(value)) return value;
  const text = String(value == null ? '' : value).trim();
  if (!text) return [];
  if (/[,，;；、|]/.test(text)) {
    return text.split(/[,，;；、|]/).map((part) => part.trim()).filter(Boolean);
  }
  return [text];
}

function isValueSelected(savedValue, optionValue) {
  if (savedValue == null || savedValue === '') return false;
  const target = String(savedValue).trim().toLowerCase();
  const current = String(optionValue).trim().toLowerCase();
  return target === current || target.includes(current) || current.includes(target);
}

function createTextControl(key, chineseName, savedValue, placeholder) {
  const input = document.createElement('input');
  input.type = 'text';
  input.id = `field_${key}`;
  input.name = key;
  input.placeholder = placeholder || `请输入${chineseName}`;
  if (savedValue !== undefined && savedValue !== null) {
    input.value = savedValue;
  }
  return input;
}

function createFieldControl(key, chineseName, meta, savedValue) {
  const { type, options } = meta;

  if (type === WebFormFieldType.TYPES.TEXTAREA) {
    const textarea = document.createElement('textarea');
    textarea.id = `field_${key}`;
    textarea.name = key;
    textarea.rows = 3;
    textarea.placeholder = `请输入${chineseName}`;
    if (savedValue !== undefined && savedValue !== null) textarea.value = savedValue;
    return textarea;
  }

  if (type === WebFormFieldType.TYPES.NUMBER) {
    const input = document.createElement('input');
    input.type = 'number';
    input.id = `field_${key}`;
    input.name = key;
    input.placeholder = `请输入${chineseName}`;
    if (savedValue !== undefined && savedValue !== null) input.value = savedValue;
    return input;
  }

  if (type === WebFormFieldType.TYPES.DATE) {
    const input = document.createElement('input');
    input.type = 'date';
    input.id = `field_${key}`;
    input.name = key;
    if (savedValue) {
      const normalized = String(savedValue).replace(/\//g, '-').slice(0, 10);
      input.value = normalized;
    }
    return input;
  }

  if (type === WebFormFieldType.TYPES.CHECKBOX) {
    const wrap = document.createElement('label');
    wrap.className = 'choice-item choice-item-checkbox';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = `field_${key}`;
    input.name = key;
    input.checked = ['true', '1', 'yes', 'on', '是'].includes(String(savedValue || '').toLowerCase());
    wrap.appendChild(input);
    wrap.appendChild(document.createTextNode('是'));
    return wrap;
  }

  if (type === WebFormFieldType.TYPES.RADIO) {
    if (!options.length) {
      const input = createTextControl(key, chineseName, savedValue, `请输入${chineseName}（单选项文字）`);
      const wrap = document.createDocumentFragment();
      const hint = document.createElement('p');
      hint.className = 'field-hint';
      hint.textContent = '未从页面读到选项，请打开目标表单页后重新选择配置';
      wrap.appendChild(hint);
      wrap.appendChild(input);
      return wrap;
    }
    const group = document.createElement('div');
    group.className = 'choice-group choice-group-radio';
    options.forEach((option, index) => {
      const wrap = document.createElement('label');
      wrap.className = 'choice-item';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = `field_${key}`;
      input.value = option;
      input.id = `field_${key}_${index}`;
      if (isValueSelected(savedValue, option)) input.checked = true;
      wrap.appendChild(input);
      wrap.appendChild(document.createTextNode(option));
      group.appendChild(wrap);
    });
    return group;
  }

  if (type === WebFormFieldType.TYPES.SELECT) {
    if (!options.length) {
      return createTextControl(key, chineseName, savedValue, `请输入${chineseName}（下拉选项文字）`);
    }
    const select = document.createElement('select');
    select.id = `field_${key}`;
    select.name = key;
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = `请选择${chineseName}`;
    select.appendChild(placeholder);
    options.forEach((option) => {
      const opt = document.createElement('option');
      opt.value = option;
      opt.textContent = option;
      if (isValueSelected(savedValue, option)) opt.selected = true;
      select.appendChild(opt);
    });
    return select;
  }

  if (type === WebFormFieldType.TYPES.MULTISELECT) {
    if (!options.length) {
      return createTextControl(
        key,
        chineseName,
        savedValue,
        `请输入${chineseName}（多个选项用逗号分隔）`
      );
    }
    const selectedValues = parseSavedMultiValue(savedValue);
    const group = document.createElement('div');
    group.className = 'choice-group choice-group-checkbox';
    options.forEach((option, index) => {
      const wrap = document.createElement('label');
      wrap.className = 'choice-item';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.name = `field_${key}`;
      input.value = option;
      input.id = `field_${key}_${index}`;
      input.checked = selectedValues.some((value) => isValueSelected(value, option));
      wrap.appendChild(input);
      wrap.appendChild(document.createTextNode(option));
      group.appendChild(wrap);
    });
    return group;
  }

  return createTextControl(key, chineseName, savedValue);
}

function collectFormData() {
  const formData = {};

  document.querySelectorAll('#formFields .form-field').forEach((fieldDiv) => {
    const key = fieldDiv.dataset.fieldKey;
    const type = fieldDiv.dataset.fieldType || WebFormFieldType.TYPES.TEXT;
    if (!key) return;

    if (type === WebFormFieldType.TYPES.RADIO) {
      const checked = fieldDiv.querySelector(`input[type="radio"][name="field_${key}"]:checked`);
      formData[key] = checked ? checked.value : (fieldDiv.querySelector(`#field_${key}`)?.value || '');
      return;
    }

    if (type === WebFormFieldType.TYPES.MULTISELECT) {
      const checked = fieldDiv.querySelectorAll(`input[type="checkbox"][name="field_${key}"]:checked`);
      if (checked.length) {
        formData[key] = Array.from(checked).map((item) => item.value).join(',');
        return;
      }
      formData[key] = fieldDiv.querySelector(`#field_${key}`)?.value?.trim() || '';
      return;
    }

    if (type === WebFormFieldType.TYPES.CHECKBOX) {
      const checkbox = fieldDiv.querySelector(`#field_${key}`);
      formData[key] = checkbox?.checked ? '是' : '否';
      return;
    }

    const control = fieldDiv.querySelector(`#field_${key}`);
    formData[key] = control ? String(control.value || '').trim() : '';
  });

  return formData;
}

async function generateFormFields(savedData = null) {
  if (!currentConfig) return;

  const formFields = document.getElementById('formFields');
  formFields.innerHTML = '<p class="field-hint">正在从页面读取字段类型...</p>';

  const liveMeta = await fetchLiveFieldMetaFromPage();
  lastLiveMeta = liveMeta;
  formFields.innerHTML = '';

  Object.keys(currentConfig.mappings).forEach((key) => {
    const chineseName = currentConfig.mappings[key];
    const meta = getFieldMeta(key, chineseName, liveMeta);
    const fieldDiv = document.createElement('div');
    fieldDiv.className = 'form-field';
    fieldDiv.dataset.fieldKey = key;
    fieldDiv.dataset.fieldType = meta.type;

    const label = document.createElement('label');
    label.textContent = chineseName;
    label.setAttribute('for', `field_${key}`);

    const savedValue = savedData && savedData[key] !== undefined ? savedData[key] : '';
    const control = createFieldControl(key, chineseName, meta, savedValue);

    fieldDiv.appendChild(label);
    fieldDiv.appendChild(control);
    formFields.appendChild(fieldDiv);
  });
}

function setupSavedConfigs() {
  const saveBtn = document.getElementById('saveConfigBtn');
  const importBtn = document.getElementById('importConfigBtn');
  const importFileInput = document.getElementById('importFileInput');
  const exportBtn = document.getElementById('exportConfigBtn');
  const deleteBtn = document.getElementById('deleteConfigBtn');
  const select = document.getElementById('savedConfigsSelect');

  if (saveBtn) saveBtn.addEventListener('click', saveCurrentFormData);
  if (importBtn) importBtn.addEventListener('click', () => importFileInput.click());
  if (importFileInput) importFileInput.addEventListener('change', handleImportFile);
  if (exportBtn) exportBtn.addEventListener('click', exportSelectedConfig);
  if (deleteBtn) deleteBtn.addEventListener('click', deleteSelectedConfig);

  if (select) {
    select.addEventListener('change', (e) => {
      if (e.target.value) {
        loadConfigById(e.target.value);
      }
    });
  }
}

async function saveCurrentFormData() {
  if (!currentConfig) {
    showMessage('请先选择一个配置', 'error');
    return;
  }

  const configSelect = document.getElementById('configSelect');
  const configId = configSelect.value;
  if (!configId) {
    showMessage('请先选择一个配置', 'error');
    return;
  }

  const formData = collectFormData();
  let hasData = false;

  Object.values(formData).forEach((value) => {
    if (String(value).trim()) hasData = true;
  });

  if (!hasData) {
    showMessage('请至少填写一个字段', 'error');
    return;
  }

  const configName = prompt('请输入配置名称:', `${currentConfig.name}_${new Date().toLocaleDateString()}`);
  if (!configName || !configName.trim()) return;

  const savedConfig = {
    id: Date.now().toString(),
    name: configName.trim(),
    configId,
    configName: currentConfig.name,
    data: formData,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  try {
    const savedConfigs = await WebFormStorage.getSavedFormDataList();
    savedConfigs.push(savedConfig);
    await WebFormStorage.saveSavedFormDataList(savedConfigs);
    showMessage('配置保存成功', 'success');
    await loadSavedConfigsList();
  } catch (error) {
    console.error('保存配置失败:', error);
    showMessage('保存配置失败: ' + error.message, 'error');
  }
}

async function loadSavedConfigsList() {
  const select = document.getElementById('savedConfigsSelect');
  if (!select) return;

  try {
    const savedConfigs = await WebFormStorage.getSavedFormDataList();
    select.innerHTML = '<option value="">-- 选择已保存的配置 --</option>';

    savedConfigs.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    savedConfigs.forEach((config) => {
      const option = document.createElement('option');
      option.value = config.id;
      const date = new Date(config.updatedAt).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
      option.textContent = `${config.name} [${config.configName}] - ${date}`;
      select.appendChild(option);
    });
  } catch (error) {
    console.error('加载配置列表失败:', error);
  }
}

async function loadConfigById(configId) {
  try {
    const savedConfigs = await WebFormStorage.getSavedFormDataList();
    const config = savedConfigs.find((c) => c.id === configId);

    if (!config) {
      showMessage('配置不存在', 'error');
      return;
    }

    const configSelect = document.getElementById('configSelect');
    configSelect.value = config.configId;
    await updateConfigDescription(config.configId);
    await generateFormFields(config.data);
    showMessage(`已加载配置: ${config.name}`, 'success');
  } catch (error) {
    console.error('加载配置失败:', error);
    showMessage('加载配置失败: ' + error.message, 'error');
  }
}

async function deleteSelectedConfig() {
  const select = document.getElementById('savedConfigsSelect');
  if (!select || !select.value) {
    showMessage('请先选择一个要删除的配置', 'error');
    return;
  }

  const savedConfigs = await WebFormStorage.getSavedFormDataList();
  const config = savedConfigs.find((c) => c.id === select.value);

  if (!config) {
    showMessage('配置不存在', 'error');
    return;
  }

  if (confirm(`确定要删除配置 "${config.name}" 吗？`)) {
    await deleteSavedConfig(select.value);
    select.value = '';
  }
}

async function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const importData = JSON.parse(text);

    if (!importData.name || !importData.data) {
      throw new Error('导入文件格式不正确：缺少必要字段');
    }

    if (!importData.configType) {
      const configSelect = document.getElementById('configSelect');
      if (!configSelect.value) {
        throw new Error('请先选择配置类型，或确保导入文件包含配置类型信息');
      }
      const config = configsIndex.configs.find((c) => c.id === configSelect.value);
      if (config) {
        importData.configType = config.name;
        importData.configId = config.id;
      } else {
        throw new Error('无法确定配置类型');
      }
    } else {
      const config = configsIndex.configs.find((c) => c.name === importData.configType);
      if (config) {
        importData.configId = config.id;
      }
    }

    const savedConfig = {
      id: Date.now().toString(),
      name: importData.name,
      configId: importData.configId || '',
      configName: importData.configType || importData.configName || '未知配置',
      data: importData.data,
      createdAt: importData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const savedConfigs = await WebFormStorage.getSavedFormDataList();
    savedConfigs.push(savedConfig);
    await WebFormStorage.saveSavedFormDataList(savedConfigs);

    showMessage(`成功导入配置: ${savedConfig.name}`, 'success');
    await loadSavedConfigsList();
    event.target.value = '';

    const select = document.getElementById('savedConfigsSelect');
    if (select) {
      select.value = savedConfig.id;
      await loadConfigById(savedConfig.id);
    }
  } catch (error) {
    console.error('导入配置失败:', error);
    showMessage('导入配置失败: ' + error.message, 'error');
    event.target.value = '';
  }
}

async function exportSelectedConfig() {
  const select = document.getElementById('savedConfigsSelect');
  if (!select || !select.value) {
    showMessage('请先选择一个要导出的配置', 'error');
    return;
  }

  try {
    const savedConfigs = await WebFormStorage.getSavedFormDataList();
    const config = savedConfigs.find((c) => c.id === select.value);

    if (!config) {
      showMessage('配置不存在', 'error');
      return;
    }

    const exportData = {
      name: config.name,
      configType: config.configName,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
      data: config.data
    };

    downloadJson(exportData, `${config.name}_${new Date().toISOString().split('T')[0]}.json`);
    showMessage('配置导出成功', 'success');
  } catch (error) {
    console.error('导出配置失败:', error);
    showMessage('导出配置失败: ' + error.message, 'error');
  }
}

async function deleteSavedConfig(configId) {
  try {
    const savedConfigs = await WebFormStorage.getSavedFormDataList();
    const filtered = savedConfigs.filter((c) => c.id !== configId);
    await WebFormStorage.saveSavedFormDataList(filtered);
    showMessage('配置已删除', 'success');
    await loadSavedConfigsList();
  } catch (error) {
    console.error('删除配置失败:', error);
    showMessage('删除配置失败: ' + error.message, 'error');
  }
}

async function loadConfigsIndex() {
  try {
    configsIndex = await WebFormStorage.getConfigsIndex();
    populateConfigSelect();
  } catch (error) {
    console.error('加载配置索引失败:', error);
    showMessage('加载配置索引失败: ' + error.message, 'error');
  }
}

function populateConfigSelect() {
  const select = document.getElementById('configSelect');
  select.innerHTML = '';

  if (!configsIndex || !configsIndex.configs || configsIndex.configs.length === 0) {
    select.innerHTML = '<option value="">无可用配置</option>';
    return;
  }

  configsIndex.configs.forEach((config) => {
    const option = document.createElement('option');
    option.value = config.id;
    option.textContent = config.name;
    select.appendChild(option);
  });

  const defaultConfigId = configsIndex.default || configsIndex.configs[0]?.id;
  if (defaultConfigId) {
    select.value = defaultConfigId;
    updateConfigDescription(defaultConfigId);
  }

  updateRecordingButtonLabel();
}

async function updateConfigDescription(configId) {
  const description = document.getElementById('configDescription');
  const config = configsIndex?.configs?.find((c) => c.id === configId);

  if (config && config.description) {
    description.textContent = config.description;
    description.hidden = false;
  } else {
    description.hidden = true;
  }

  if (configId && config) {
    try {
      currentConfig = await WebFormStorage.getConfig(configId);
      await generateFormFields();
    } catch (error) {
      console.error('加载配置失败:', error);
    }
  }
}

document.getElementById('submitButton').addEventListener('click', async () => {
  const configSelect = document.getElementById('configSelect');
  const selectedConfigId = configSelect.value;

  if (!selectedConfigId) {
    showMessage('请先选择一个配置', 'error');
    return;
  }

  try {
    currentConfig = await WebFormStorage.getConfig(selectedConfigId);
    await processFormInput();
  } catch (error) {
    console.error('处理失败:', error);
    showMessage('处理失败: ' + error.message, 'error');
  }
});

async function processFormInput() {
  const formData = collectFormData();

  const hasData = Object.values(formData).some((val) => String(val).trim() !== '');
  if (!hasData) {
    throw new Error('请至少填写一个字段');
  }

  const mappedData = mapData(formData, currentConfig.mappings);
  const fieldHints = buildFieldHints(currentConfig);
  const result = await fillFormOnPage([mappedData], currentConfig.fieldMappings, fieldHints);
  showFillResult(result);
}

function buildFieldHints(config) {
  const hints = {};
  if (!config?.mappings) return hints;

  Object.entries(config.mappings).forEach(([key, label]) => {
    hints[label] = WebFormFieldType.resolveMeta(config, key, label);
  });
  return hints;
}

function mapData(entry, mappings) {
  const mappedEntry = {};
  Object.keys(mappings).forEach((key) => {
    mappedEntry[mappings[key]] = entry[key];
  });
  return mappedEntry;
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

function isFillableUrl(url) {
  if (!url) return false;
  return !url.startsWith('chrome://')
    && !url.startsWith('chrome-extension://')
    && !url.startsWith('edge://')
    && !url.startsWith('about:');
}

async function updateSubmitButtonState() {
  const submitButton = document.getElementById('submitButton');
  const startRecordingBtn = document.getElementById('startRecordingBtn');
  if (!submitButton) return;

  const tab = await getActiveTab();
  const canFill = tab && isFillableUrl(tab.url);
  submitButton.disabled = !canFill;
  submitButton.title = canFill ? '' : '请先打开要填充的目标网页';
  if (startRecordingBtn) {
    startRecordingBtn.disabled = !canFill;
    startRecordingBtn.title = canFill ? '' : '请先打开要录制的目标网页';
  }
}

function setupRecording() {
  const startBtn = document.getElementById('startRecordingBtn');
  const stopBtn = document.getElementById('stopRecordingBtn');

  if (startBtn) {
    startBtn.addEventListener('click', startRecording);
  }
  if (stopBtn) {
    stopBtn.addEventListener('click', stopRecording);
  }
}

function setRecordingButtons(recording) {
  const startBtn = document.getElementById('startRecordingBtn');
  const stopBtn = document.getElementById('stopRecordingBtn');
  if (startBtn) startBtn.hidden = recording;
  if (stopBtn) stopBtn.hidden = !recording;
}

async function updateRecordingButtonState() {
  const tab = await getActiveTab();
  const startBtn = document.getElementById('startRecordingBtn');
  if (!tab || !isFillableUrl(tab.url) || !startBtn) return;

  try {
    const status = await chrome.tabs.sendMessage(tab.id, { action: 'GET_RECORDING_STATUS' });
    setRecordingButtons(!!status?.active);
  } catch (e) {
    setRecordingButtons(false);
  }
}

async function startRecording() {
  const tab = await getActiveTab();
  if (!tab || !isFillableUrl(tab.url)) {
    showMessage('请先打开要录制的目标网页', 'error');
    return;
  }

  const configSelect = document.getElementById('configSelect');
  const selectedConfigId = configSelect?.value || '';
  let baseConfig = null;

  if (selectedConfigId) {
    baseConfig = await WebFormStorage.getConfig(selectedConfigId);
    if (!baseConfig) {
      showMessage('无法加载当前配置', 'error');
      return;
    }
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: [
        'shared/locator.js',
        'shared/dom-label.js',
        'shared/field-key.js',
        'shared/field-type.js',
        'content/recorder.js'
      ]
    });

    await chrome.tabs.sendMessage(tab.id, {
      action: 'START_RECORDING',
      baseConfig
    });

    setRecordingButtons(true);

    const hint = baseConfig
      ? `正在向「${baseConfig.name}」追加字段，请点击新表单元素`
      : '录制已开始，请在页面中点击表单字段';
    showMessage(hint, 'success');
    window.close();
  } catch (error) {
    console.error('启动录制失败:', error);
    showMessage('启动录制失败: ' + error.message, 'error');
  }
}

function updateRecordingButtonLabel() {
  const btn = document.getElementById('startRecordingBtn');
  const hint = document.getElementById('recordingHint');
  const configSelect = document.getElementById('configSelect');
  const hasConfig = configSelect && configSelect.value;

  if (btn) {
    btn.textContent = hasConfig ? '追加录制' : '录制配置';
  }
  if (hint) {
    hint.textContent = hasConfig
      ? '在选中模板基础上追加新字段'
      : '点击页面字段，自动生成 CSS 选择器映射';
  }
}

async function stopRecording() {
  const tab = await getActiveTab();
  if (!tab) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'STOP_RECORDING' });
    showMessage('录制已取消', 'info');
  } catch (e) {
    // tab may not have recorder
  }

  setRecordingButtons(false);
}

async function fillFormOnPage(jsonData, fieldMappings, fieldHints) {
  const tab = await getActiveTab();
  if (!tab) {
    throw new Error('无法获取当前标签页');
  }
  if (!isFillableUrl(tab.url)) {
    throw new Error('无法在此页面填充，请打开目标网页');
  }

  await chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    files: ['shared/field-type.js', 'shared/fill-engine.js']
  });

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    func: (data, mappings, hints) => window.WebFormFillEngine.fillForm(data, mappings, hints),
    args: [jsonData, fieldMappings, fieldHints || {}]
  });

  return results?.[0]?.result || {
    successCount: 0,
    errorCount: 0,
    errors: [],
    skipped: []
  };
}

function showFillResult(result) {
  lastFillResult = result;
  const fillResult = document.getElementById('fillResult');
  if (!fillResult) return;

  const total = result.successCount + result.errorCount;
  const allFailed = result.successCount === 0 && result.errorCount > 0;
  const partial = result.successCount > 0 && result.errorCount > 0;

  let statusClass = 'fill-result-success';
  let summary = `填充完成：成功 ${result.successCount} / 共 ${total} 个字段`;

  if (allFailed) {
    statusClass = 'fill-result-error';
    summary = `填充失败：${result.errorCount} 个字段未能填充`;
    showMessage('表单填充失败', 'error');
  } else if (partial) {
    statusClass = 'fill-result-warning';
    summary = `部分成功：成功 ${result.successCount}，失败 ${result.errorCount}`;
    showMessage('表单部分填充成功', 'info');
  } else {
    showMessage('表单填充成功', 'success');
  }

  const issues = [...(result.errors || []), ...(result.skipped || [])];
  let detailsHtml = '';
  if (issues.length > 0) {
    const items = issues.map((item) => {
      const reason = item.reason || '未知错误';
      const xpath = item.xpath ? ` (${item.xpath})` : '';
      return `<li><strong>${item.field}</strong>: ${reason}${xpath}</li>`;
    }).join('');
    detailsHtml = `
      <details class="fill-result-details">
        <summary>查看失败详情 (${issues.length})</summary>
        <ul>${items}</ul>
      </details>`;
  }

  fillResult.className = `fill-result ${statusClass}`;
  fillResult.innerHTML = `<div class="fill-result-summary">${summary}</div>${detailsHtml}`;
  fillResult.hidden = false;
}

function setupConfigTypeActions() {
  const importBtn = document.getElementById('importConfigTypeBtn');
  const importFileInput = document.getElementById('importConfigTypeInput');
  const exportBtn = document.getElementById('exportConfigTypeBtn');
  const deleteBtn = document.getElementById('deleteConfigTypeBtn');

  if (importBtn && importFileInput) {
    importBtn.addEventListener('click', () => importFileInput.click());
    importFileInput.addEventListener('change', handleImportConfigType);
  }
  if (exportBtn) exportBtn.addEventListener('click', handleExportConfigType);
  if (deleteBtn) deleteBtn.addEventListener('click', handleDeleteConfigType);
}

async function handleImportConfigType(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const configData = JSON.parse(text);

    if (!configData.id || !configData.name || !configData.fieldMappings || !configData.mappings) {
      throw new Error('配置文件格式不正确：缺少必要字段（id, name, fieldMappings, mappings）');
    }

    configsIndex = await WebFormStorage.upsertConfigInIndex(configData);
    showMessage('配置文件已导入（已自动保存，立即可用）', 'success');
    populateConfigSelect();
    event.target.value = '';
  } catch (error) {
    console.error('导入配置失败:', error);
    showMessage('导入配置失败: ' + error.message, 'error');
    event.target.value = '';
  }
}

async function handleExportConfigType() {
  const configSelect = document.getElementById('configSelect');
  const selectedConfigId = configSelect.value;

  if (!selectedConfigId) {
    showMessage('请先选择一个要导出的配置', 'error');
    return;
  }

  try {
    const configData = await WebFormStorage.getConfig(selectedConfigId);
    if (!configData) {
      showMessage('配置不存在', 'error');
      return;
    }

    downloadJson(configData, `${selectedConfigId}.json`);
    showMessage('配置导出成功', 'success');
  } catch (error) {
    console.error('导出配置失败:', error);
    showMessage('导出配置失败: ' + error.message, 'error');
  }
}

async function handleDeleteConfigType() {
  const configSelect = document.getElementById('configSelect');
  const selectedConfigId = configSelect.value;

  if (!selectedConfigId) {
    showMessage('请先选择一个要删除的配置', 'error');
    return;
  }

  try {
    const config = configsIndex.configs.find((c) => c.id === selectedConfigId);
    if (!config) {
      showMessage('配置不存在', 'error');
      return;
    }

    if (!confirm(`确定要删除配置 "${config.name}" 吗？`)) return;

    configsIndex = await WebFormStorage.removeConfigFromIndex(selectedConfigId);
    showMessage('配置已删除（已自动清理）', 'success');
    populateConfigSelect();
  } catch (error) {
    console.error('删除配置失败:', error);
    showMessage('删除配置失败: ' + error.message, 'error');
  }
}

function downloadJson(data, filename) {
  const jsonText = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonText], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function showMessage(message, type = 'info') {
  const messageDiv = document.getElementById('message');
  messageDiv.textContent = message;
  messageDiv.className = `message message-${type}`;
  messageDiv.hidden = false;

  if (type === 'success') {
    setTimeout(() => {
      messageDiv.hidden = true;
    }, 3000);
  }
}
