(function () {
  function isXPath(selector) {
    if (!selector || typeof selector !== 'string') return false;
    const s = selector.trim();
    return s.startsWith('/') || s.startsWith('(');
  }

  function normalizeLabelText(text) {
    if (!text) return '';
    return text.replace(/\s+/g, ' ').replace(/[:：]\s*$/, '').trim();
  }

  function normalizeCompareText(text) {
    return String(text == null ? '' : text).trim().toLowerCase();
  }

  function textsMatch(a, b) {
    const x = normalizeCompareText(a);
    const y = normalizeCompareText(b);
    if (!x || !y) return false;
    return x === y || x.includes(y) || y.includes(x);
  }

  function isFillableElement(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === 'input') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) return false;
    }
    return ['input', 'textarea', 'select'].includes(tag) || el.isContentEditable;
  }

  function isResolvableTarget(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    if (isFillableElement(el)) return true;
    if (el.matches('.el-radio-group, .ant-radio-group, [role="radiogroup"]')) return true;
    if (el.matches('.el-checkbox-group, .ant-checkbox-group')) return true;
    if (el.matches('.el-select, .ant-select')) return true;
    if (el.matches('.el-date-editor, .el-range-editor, .ant-picker, .el-date-picker')) return true;
    return false;
  }

  function tryResolveOne(selector, doc) {
    if (!selector) return null;

    try {
      if (isXPath(selector)) {
        const result = doc.evaluate(
          selector,
          doc,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        );
        const node = result.singleNodeValue;
        return node && isResolvableTarget(node) ? node : null;
      }
      const node = doc.querySelector(selector);
      return node && isResolvableTarget(node) ? node : null;
    } catch (e) {
      return null;
    }
  }

  function resolveByLabelText(labelText, doc) {
    const label = normalizeLabelText(labelText);
    if (!label) return null;

    if (typeof WebFormFieldType !== 'undefined') {
      const associated = WebFormFieldType.resolveControlByFormLabel(label, doc);
      if (associated && isResolvableTarget(associated)) {
        return associated;
      }
    }

    const labelLit = label.includes("'") ? `"${label.replace(/"/g, '')}"` : `'${label}'`;
    const xpaths = [
      `//div[contains(@class,"el-form-item")][.//*[contains(@class,"el-form-item__label") and contains(normalize-space(.), ${labelLit})]]//div[contains(@class,"el-date-editor")][1]`,
      `//div[contains(@class,"el-form-item")][.//*[contains(@class,"el-form-item__label") and contains(normalize-space(.), ${labelLit})]]//div[contains(@class,"el-range-editor")][1]`,
      `//div[contains(@class,"el-form-item")][.//*[contains(@class,"el-form-item__label") and contains(normalize-space(.), ${labelLit})]]//div[contains(@class,"el-date-editor")]//input[1]`,
      `//div[contains(@class,"el-form-item")][.//*[contains(@class,"el-form-item__label") and contains(normalize-space(.), ${labelLit})]]//div[contains(@class,"ant-picker")]//input[1]`,
      `//div[contains(@class,"el-form-item")][.//*[contains(@class,"el-form-item__label") and contains(normalize-space(.), ${labelLit})]]//div[contains(@class,"el-select")][1]`,
      `//div[contains(@class,"el-form-item")][.//*[contains(@class,"el-form-item__label") and contains(normalize-space(.), ${labelLit})]]//div[contains(@class,"el-checkbox-group")][1]`,
      `//div[contains(@class,"el-form-item")][.//*[contains(@class,"el-form-item__label") and contains(normalize-space(.), ${labelLit})]]//div[contains(@class,"el-radio-group")][1]`,
      `//div[contains(@class,"el-form-item")][.//*[contains(@class,"el-form-item__label") and contains(normalize-space(.), ${labelLit})]]//input[not(@type="hidden")][1]`,
      `//div[contains(@class,"el-form-item")][.//*[contains(@class,"el-form-item__label") and contains(normalize-space(.), ${labelLit})]]//textarea[1]`,
      `//div[contains(@class,"ant-form-item")][.//*[contains(@class,"ant-form-item-label") and contains(normalize-space(.), ${labelLit})]]//div[contains(@class,"ant-picker")]//input[1]`,
      `//div[contains(@class,"ant-form-item")][.//*[contains(@class,"ant-form-item-label") and contains(normalize-space(.), ${labelLit})]]//div[contains(@class,"ant-select")][1]`,
      `//div[contains(@class,"ant-form-item")][.//*[contains(@class,"ant-form-item-label") and contains(normalize-space(.), ${labelLit})]]//div[contains(@class,"ant-checkbox-group")][1]`,
      `//div[contains(@class,"ant-form-item")][.//*[contains(@class,"ant-form-item-label") and contains(normalize-space(.), ${labelLit})]]//div[contains(@class,"ant-radio-group")][1]`,
      `//div[contains(@class,"ant-form-item")][.//*[contains(@class,"ant-form-item-label") and contains(normalize-space(.), ${labelLit})]]//input[not(@type="hidden")][1]`,
      `//div[contains(@class,"ant-form-item")][.//label[contains(normalize-space(.), ${labelLit})]]//input[not(@type="hidden")][1]`,
      `//label[contains(normalize-space(.), ${labelLit})]/following::input[not(@type="hidden")][1]`,
      `//label[contains(normalize-space(.), ${labelLit})]/following::textarea[1]`,
      `//th[contains(normalize-space(.), ${labelLit})]/following-sibling::td//input[not(@type="hidden")][1]`,
      `//td[contains(normalize-space(.), ${labelLit})]/following-sibling::td//input[not(@type="hidden")][1]`
    ];

    for (const xpath of xpaths) {
      const el = tryResolveOne(xpath, doc);
      if (el) return el;
    }

    const items = doc.querySelectorAll('.el-form-item, .ant-form-item, [class*="form-item"]');
    for (const item of items) {
      const labelEl = item.querySelector('.el-form-item__label, .ant-form-item-label');
      if (!labelEl || labelEl.closest('.el-radio-group, .ant-radio-group')) continue;
      const text = normalizeLabelText(labelEl.textContent);
      if (!text) continue;
      const labelsMatchFn = typeof WebFormFieldType !== 'undefined'
        ? WebFormFieldType.labelsMatch.bind(WebFormFieldType)
        : (a, b) => a === b || a.includes(b) || b.includes(a);
      if (!labelsMatchFn(text, label)) continue;

      if (typeof WebFormFieldType !== 'undefined') {
        const control = WebFormFieldType.findFormControlByLabel(label, doc);
        if (control && isResolvableTarget(control)) return control;
      }

      const dateRoot = item.querySelector('.el-date-editor, .el-range-editor, .ant-picker');
      if (dateRoot) return dateRoot;

      const radioGroup = item.querySelector('.el-radio-group, .ant-radio-group, .ivu-radio-group, .arco-radio-group, [role="radiogroup"]');
      if (radioGroup) return radioGroup;

      const checkboxGroup = item.querySelector('.el-checkbox-group, .ant-checkbox-group');
      if (checkboxGroup) return checkboxGroup;

      const uiSelect = item.querySelector('.el-select, .ant-select');
      if (uiSelect) return uiSelect;

      const dateInput = item.querySelector('.el-date-editor input, .ant-picker input, input[type="date"]');
      if (dateInput) return dateInput;

      const input = item.querySelector('input:not([type="hidden"]), textarea, select');
      if (input) return input;
    }

    return null;
  }

  function resolveElement(locator, doc, fieldLabel) {
    const candidates = [];

    if (typeof locator === 'string') {
      candidates.push(locator);
    } else if (locator) {
      if (locator.primary) candidates.push(locator.primary);
      if (locator.css) candidates.push(locator.css);
      if (locator.fallback) candidates.push(locator.fallback);
      if (locator.xpath) candidates.push(locator.xpath);
      if (locator.legacy) candidates.push(locator.legacy);
    }

    const seen = new Set();
    for (const sel of candidates) {
      if (!sel || seen.has(sel)) continue;
      seen.add(sel);
      const el = tryResolveOne(sel, doc);
      if (el) return el;
    }

    const labelText = (locator && locator.labelText) || fieldLabel;
    if (labelText) {
      return resolveByLabelText(labelText, doc);
    }

    return null;
  }

  function getFormItemRoot(element) {
    return element.closest('.el-form-item, .ant-form-item, [class*="form-item"]');
  }

  function datesEqual(a, b) {
    const pa = parseDateString(a);
    const pb = parseDateString(b);
    return !!(pa && pb && pa === pb);
  }

  function getRadioLabelText(radio) {
    if (typeof WebFormFieldType !== 'undefined') {
      return WebFormFieldType.getOptionLabel(radio);
    }
    const label = radio.closest('label');
    if (label) {
      const span = label.querySelector('.el-radio__label, .el-radio-button__inner, .ant-radio + span');
      const text = span ? span.textContent : label.textContent;
      return normalizeLabelText(text);
    }
    const wrapper = radio.closest('.el-radio, .el-radio-button, .ant-radio-wrapper, .ant-radio-button-wrapper');
    if (wrapper) {
      const span = wrapper.querySelector('.el-radio__label, .el-radio-button__inner');
      if (span) return normalizeLabelText(span.textContent);
      return normalizeLabelText(wrapper.textContent);
    }
    const parent = radio.parentElement;
    if (parent) {
      const next = parent.nextElementSibling;
      if (next) return normalizeLabelText(next.textContent);
    }
    return '';
  }

  function optionTextsMatch(a, b) {
    const x = normalizeCompareText(a);
    const y = normalizeCompareText(b);
    if (!x || !y) return false;
    if (x === y) return true;
    if (Math.min(x.length, y.length) <= 2) return false;
    return x.includes(y) || y.includes(x);
  }

  function getRadioCandidates(groupRoot, strValue, hintOptions) {
    if (!groupRoot) return [];

    let scope = groupRoot;
    if (typeof WebFormFieldType !== 'undefined') {
      if (groupRoot instanceof NodeList || Array.isArray(groupRoot)) {
        return Array.from(groupRoot);
      }
      scope = WebFormFieldType.expandRadioGroupScope(groupRoot);
      let radios = WebFormFieldType.collectRadioClickTargets(scope);
      if (!radios.length) {
        radios = WebFormFieldType.collectRadioOptionElements(scope);
      }
      if (!radios.length && strValue) {
        radios = WebFormFieldType.findRadioCandidatesByText(scope, strValue, hintOptions);
      }
      if (!radios.length) {
        const formItem = getFormItemRoot(scope);
        if (formItem && formItem !== scope) {
          radios = WebFormFieldType.findRadioCandidatesByText(formItem, strValue, hintOptions);
        }
      }
      return radios;
    }

    if (groupRoot instanceof NodeList || Array.isArray(groupRoot)) {
      return Array.from(groupRoot);
    }
    return Array.from(scope.querySelectorAll('input[type="radio"]'));
  }

  function selectRadioOption(radio) {
    const input = radio.matches?.('input[type="radio"]')
      ? radio
      : radio.querySelector?.('input[type="radio"]');

    const clickTarget = radio.closest(
      'label.el-radio, label.el-radio-button, label.ant-radio-wrapper, label.ant-radio-button-wrapper, label.ivu-radio-wrapper, label.arco-radio, label.n-radio, label.t-radio-button, label'
    ) || radio;

    clickTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    clickTarget.click();
    clickTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));

    if (input) {
      input.focus?.();
      if (!input.checked) {
        input.checked = true;
      }
      dispatchInputEvents(input);
      return { ok: true };
    }

    if (radio.getAttribute?.('role') === 'radio') {
      radio.setAttribute('aria-checked', 'true');
      radio.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true };
    }

    if (radio.checked !== undefined) {
      radio.checked = true;
      dispatchInputEvents(radio);
    }
    return { ok: true };
  }

  function findRadioGroup(element) {
    if (typeof WebFormFieldType !== 'undefined') {
      const grouped = WebFormFieldType.findRadioGroupRoot(element, document);
      if (grouped) return grouped;
    }

    const grouped = element.closest('.el-radio-group, .ant-radio-group, .ivu-radio-group, .arco-radio-group, [role="radiogroup"]');
    if (grouped) return grouped;

    const formItem = getFormItemRoot(element);
    const inFormItem = formItem?.querySelector('.el-radio-group, .ant-radio-group, .ivu-radio-group, .arco-radio-group, [role="radiogroup"]');
    if (inFormItem && (inFormItem.contains(element) || element.contains(inFormItem))) {
      return inFormItem;
    }

    if ((element.getAttribute('type') || '').toLowerCase() === 'radio' && element.name) {
      try {
        const escaped = typeof CSS !== 'undefined' && CSS.escape
          ? CSS.escape(element.name)
          : element.name;
        return document.querySelectorAll(`input[type="radio"][name="${escaped}"]`);
      } catch (e) {
        return document.querySelectorAll(`input[type="radio"][name="${element.name}"]`);
      }
    }

    return null;
  }

  function setRadioInGroup(groupRoot, strValue, hintOptions) {
    const radios = getRadioCandidates(groupRoot, strValue, hintOptions);
    if (!radios.length) {
      return { ok: false, reason: `单选值不匹配: ${strValue}` };
    }

    for (const radio of radios) {
      const value = radio.matches?.('input[type="radio"]') ? radio.value : (radio.getAttribute?.('value') || '');
      if (value && optionTextsMatch(value, strValue)) {
        return selectRadioOption(radio);
      }
    }

    for (const radio of radios) {
      const labelText = getRadioLabelText(radio);
      if (labelText && optionTextsMatch(labelText, strValue)) {
        return selectRadioOption(radio);
      }
    }

    const aliasMap = {
      '是': ['是', 'yes', 'true', '1', 'y', 'on'],
      '否': ['否', 'no', 'false', '0', 'n', 'off'],
      '男': ['男', 'male', 'm'],
      '女': ['女', 'female', 'f']
    };
    const normalized = normalizeCompareText(strValue);
    for (const radio of radios) {
      const labelText = getRadioLabelText(radio);
      const valueText = normalizeCompareText(radio.value || radio.getAttribute?.('value') || '');
      for (const aliases of Object.values(aliasMap)) {
        if (aliases.includes(normalized) && (aliases.includes(valueText) || aliases.includes(normalizeCompareText(labelText)))) {
          return selectRadioOption(radio);
        }
      }
    }

    if (hintOptions && hintOptions.length) {
      for (const radio of radios) {
        const labelText = getRadioLabelText(radio);
        if (hintOptions.some((opt) => optionTextsMatch(labelText, opt) && optionTextsMatch(opt, strValue))) {
          return selectRadioOption(radio);
        }
      }

      const scope = typeof WebFormFieldType !== 'undefined'
        ? WebFormFieldType.expandRadioGroupScope(groupRoot)
        : groupRoot;
      if (scope) {
        const spans = scope.querySelectorAll('.el-radio__label, .el-radio-button__inner');
        for (const span of spans) {
          if (!hintOptions.some((opt) => optionTextsMatch(span.textContent, opt) && optionTextsMatch(opt, strValue))) {
            continue;
          }
          const clickTarget = span.closest('label.el-radio, label.el-radio-button, label');
          if (clickTarget) return selectRadioOption(clickTarget);
        }
      }

      if (radios.length === hintOptions.length) {
        const idx = hintOptions.findIndex((opt) => optionTextsMatch(opt, strValue));
        if (idx >= 0 && radios[idx]) {
          return selectRadioOption(radios[idx]);
        }
      }
    }

    return { ok: false, reason: `单选值不匹配: ${strValue}` };
  }

  function parseMultiValue(strValue) {
    const s = String(strValue == null ? '' : strValue).trim();
    if (!s) return [];

    if (s.startsWith('[')) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) {
          return parsed.map((item) => String(item).trim()).filter(Boolean);
        }
      } catch (e) {
        // fall through
      }
    }

    if (/[,，;；、|]/.test(s)) {
      return s.split(/[,，;；、|]/).map((part) => part.trim()).filter(Boolean);
    }

    return [s];
  }

  function getCheckboxLabelText(checkbox) {
    const label = checkbox.closest('label');
    if (label) {
      const span = label.querySelector('.el-checkbox__label, .el-checkbox-button__inner, .ant-checkbox + span');
      const text = span ? span.textContent : label.textContent;
      return normalizeLabelText(text);
    }
    const wrapper = checkbox.closest('.el-checkbox, .el-checkbox-button, .ant-checkbox-wrapper');
    if (wrapper) {
      const span = wrapper.querySelector('.el-checkbox__label, .el-checkbox-button__inner');
      if (span) return normalizeLabelText(span.textContent);
      return normalizeLabelText(wrapper.textContent);
    }
    const parent = checkbox.parentElement;
    if (parent) {
      const next = parent.nextElementSibling;
      if (next) return normalizeLabelText(next.textContent);
    }
    return '';
  }

  function checkboxMatchesValue(checkbox, value) {
    if (textsMatch(checkbox.value, value)) return true;
    const labelText = getCheckboxLabelText(checkbox);
    return !!(labelText && textsMatch(labelText, value));
  }

  function selectCheckboxOption(checkbox, checked) {
    if (checkbox.disabled) return;
    if (checkbox.checked === checked) return;

    const label = checkbox.closest('label.el-checkbox, label.el-checkbox-button, label.ant-checkbox-wrapper, label');
    if (label) {
      label.click();
      if (checkbox.checked !== checked) {
        checkbox.checked = checked;
        dispatchInputEvents(checkbox);
      }
      return;
    }

    checkbox.checked = checked;
    dispatchInputEvents(checkbox);
    checkbox.click();
  }

  function findCheckboxGroup(element) {
    const grouped = element.closest('.el-checkbox-group, .ant-checkbox-group');
    if (grouped) return grouped;

    const formItem = getFormItemRoot(element);
    const inFormItem = formItem?.querySelector('.el-checkbox-group, .ant-checkbox-group');
    if (inFormItem && (inFormItem.contains(element) || element.contains(inFormItem))) {
      return inFormItem;
    }

    if ((element.getAttribute('type') || '').toLowerCase() === 'checkbox' && element.name) {
      try {
        const escaped = typeof CSS !== 'undefined' && CSS.escape
          ? CSS.escape(element.name)
          : element.name;
        const boxes = document.querySelectorAll(`input[type="checkbox"][name="${escaped}"]`);
        if (boxes.length > 1) return boxes;
      } catch (e) {
        const boxes = document.querySelectorAll(`input[type="checkbox"][name="${element.name}"]`);
        if (boxes.length > 1) return boxes;
      }
    }

    return null;
  }

  function getCheckboxesInGroup(groupRoot) {
    if (!groupRoot) return [];
    if (groupRoot instanceof NodeList || Array.isArray(groupRoot)) {
      return Array.from(groupRoot);
    }
    return Array.from(groupRoot.querySelectorAll('input[type="checkbox"]'));
  }

  function setCheckboxInGroup(groupRoot, strValue) {
    const checkboxes = getCheckboxesInGroup(groupRoot);
    if (!checkboxes.length) {
      return { ok: false, reason: `多选值不匹配: ${strValue}` };
    }

    const targetValues = parseMultiValue(strValue);
    if (!targetValues.length) {
      return { ok: false, reason: '多选值为空' };
    }

    const unmatched = [];
    for (const value of targetValues) {
      const matched = checkboxes.some((checkbox) => checkboxMatchesValue(checkbox, value));
      if (!matched) unmatched.push(value);
    }
    if (unmatched.length) {
      return { ok: false, reason: `多选值不匹配: ${unmatched.join(', ')}` };
    }

    for (const checkbox of checkboxes) {
      const shouldCheck = targetValues.some((value) => checkboxMatchesValue(checkbox, value));
      selectCheckboxOption(checkbox, shouldCheck);
    }

    if (groupRoot instanceof Element) {
      groupRoot.dispatchEvent(new Event('change', { bubbles: true }));
    }

    return { ok: true };
  }

  function setSelectMultiple(element, strValue) {
    const targetValues = parseMultiValue(strValue);
    if (!targetValues.length) {
      return { ok: false, reason: '多选值为空' };
    }

    const options = Array.from(element.options);
    const unmatched = [];

    for (const value of targetValues) {
      const matched = options.some((opt) => textsMatch(opt.value, value) || textsMatch(opt.text, value));
      if (!matched) unmatched.push(value);
    }
    if (unmatched.length) {
      return { ok: false, reason: `多选值不匹配: ${unmatched.join(', ')}` };
    }

    for (const opt of options) {
      opt.selected = targetValues.some((value) => textsMatch(opt.value, value) || textsMatch(opt.text, value));
    }

    dispatchInputEvents(element);
    return { ok: true };
  }

  function findUiSelectRoot(element) {
    if (!element) return null;
    if (element.matches('.el-select, .ant-select')) return element;
    const closest = element.closest('.el-select, .ant-select');
    if (closest) return closest;

    const formItem = getFormItemRoot(element);
    const inFormItem = formItem?.querySelector('.el-select, .ant-select');
    if (inFormItem && (inFormItem.contains(element) || element.contains(inFormItem))) {
      return inFormItem;
    }

    return null;
  }

  function isUiSelectMultiple(selectRoot) {
    return selectRoot.classList.contains('el-select--multiple')
      || selectRoot.classList.contains('ant-select-multiple')
      || !!selectRoot.querySelector('.el-select__tags, .ant-select-selection-overflow');
  }

  function getUiSelectControlId(selectRoot) {
    const controls = selectRoot.querySelectorAll('input, .el-select__wrapper, .ant-select-selector');
    for (const el of controls) {
      const id = el.getAttribute('aria-controls');
      if (id) return id;
    }
    return null;
  }

  function isVisibleElement(el) {
    return !!(el && (el.offsetParent !== null || el.getClientRects().length > 0));
  }

  function getUiSelectOptionItems(selectRoot) {
    const controlId = getUiSelectControlId(selectRoot);
    if (controlId) {
      const panel = document.getElementById(controlId);
      if (panel) {
        const items = panel.querySelectorAll(
          '.el-select-dropdown__item:not(.is-disabled), .ant-select-item-option:not(.ant-select-item-option-disabled), [role="option"]'
        );
        if (items.length) return Array.from(items);
      }
    }

    const poppers = document.querySelectorAll('.el-select-dropdown, .ant-select-dropdown');
    for (const popper of poppers) {
      if (!isVisibleElement(popper) && popper.style.display === 'none') continue;
      const items = popper.querySelectorAll(
        '.el-select-dropdown__item:not(.is-disabled), .ant-select-item-option:not(.ant-select-item-option-disabled)'
      );
      if (items.length) return Array.from(items);
    }

    return Array.from(document.querySelectorAll(
      '.el-select-dropdown__item:not(.is-disabled), .ant-select-item-option:not(.ant-select-item-option-disabled)'
    ));
  }

  function openUiSelect(selectRoot) {
    const trigger = selectRoot.querySelector('.el-select__wrapper, .el-input__wrapper, .el-input, .ant-select-selector')
      || selectRoot;
    trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    trigger.click();
  }

  function getUiOptionValue(optionEl) {
    return optionEl.getAttribute('data-value')
      || optionEl.getAttribute('value')
      || (optionEl.dataset && optionEl.dataset.value)
      || normalizeLabelText(optionEl.textContent);
  }

  function optionMatchesValue(optionEl, value) {
    const text = normalizeLabelText(optionEl.textContent);
    const val = getUiOptionValue(optionEl);
    return textsMatch(val, value) || textsMatch(text, value);
  }

  function clickUiOption(optionEl) {
    optionEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    optionEl.click();
  }

  function finishUiSelectChange(selectRoot) {
    const input = selectRoot.querySelector('input');
    if (input) dispatchInputEvents(input);
    selectRoot.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setUiSelectValue(element, strValue) {
    const selectRoot = findUiSelectRoot(element);
    if (!selectRoot) {
      return { ok: false, reason: `下拉值不匹配: ${strValue}` };
    }

    if (isUiSelectMultiple(selectRoot)) {
      return setUiSelectMultiple(selectRoot, strValue);
    }

    let options = getUiSelectOptionItems(selectRoot);
    if (!options.length) {
      openUiSelect(selectRoot);
      options = getUiSelectOptionItems(selectRoot);
    }

    const matched = options.find((opt) => optionMatchesValue(opt, strValue));
    if (!matched) {
      return { ok: false, reason: `下拉值不匹配: ${strValue}` };
    }

    openUiSelect(selectRoot);
    clickUiOption(matched);
    finishUiSelectChange(selectRoot);
    return { ok: true };
  }

  function setUiSelectMultiple(selectRoot, strValue) {
    const targetValues = parseMultiValue(strValue);
    if (!targetValues.length) {
      return { ok: false, reason: '多选值为空' };
    }

    openUiSelect(selectRoot);
    let options = getUiSelectOptionItems(selectRoot);
    if (!options.length) {
      options = Array.from(document.querySelectorAll(
        '.el-select-dropdown__item:not(.is-disabled), .ant-select-item-option:not(.ant-select-item-option-disabled)'
      ));
    }

    const unmatched = [];
    for (const value of targetValues) {
      if (!options.some((opt) => optionMatchesValue(opt, value))) {
        unmatched.push(value);
      }
    }
    if (unmatched.length) {
      return { ok: false, reason: `多选值不匹配: ${unmatched.join(', ')}` };
    }

    for (const value of targetValues) {
      const matched = options.find((opt) => optionMatchesValue(opt, value));
      if (matched) clickUiOption(matched);
    }

    finishUiSelectChange(selectRoot);
    return { ok: true };
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function formatIsoDate(y, m, d) {
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }

  function parseDateString(strValue) {
    const s = String(strValue).trim();
    if (!s) return null;

    let m = s.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
    if (m) return formatIsoDate(m[1], m[2], m[3]);

    m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m) return formatIsoDate(m[1], m[2], m[3]);

    const parsed = Date.parse(s);
    if (!Number.isNaN(parsed)) {
      const d = new Date(parsed);
      return formatIsoDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
    }

    return null;
  }

  function getDateInputCandidates(element) {
    const candidates = [];
    const roots = [
      element.closest('.el-date-editor'),
      element.closest('.el-range-editor'),
      element.closest('.ant-picker'),
      element.closest('.el-date-picker'),
      getFormItemRoot(element)
    ].filter(Boolean);

    for (const root of roots) {
      root.querySelectorAll('input').forEach((input) => {
        if (!candidates.includes(input)) candidates.push(input);
      });
    }

    if (element.tagName.toLowerCase() === 'input' && !candidates.includes(element)) {
      candidates.unshift(element);
    }

    return candidates;
  }

  function isDatePickerElement(element) {
    const type = (element.getAttribute('type') || '').toLowerCase();
    if (type === 'date' || type === 'datetime-local') return true;
    if (element.closest('.el-date-editor, .el-range-editor, .ant-picker, .el-date-picker')) return true;
    const ph = element.getAttribute('placeholder') || '';
    return !!element.readOnly && /日期|时间|date/i.test(ph);
  }

  function setDateValue(element, strValue) {
    const iso = parseDateString(strValue);
    if (!iso) {
      return { ok: false, reason: `日期值无法解析: ${strValue}` };
    }

    const [y, m, d] = iso.split('-');
    const variants = [
      iso,
      iso.replace(/-/g, '/'),
      `${y}/${m}/${d}`,
      `${y}年${Number(m)}月${Number(d)}日`,
      `${y}年${m}月${d}日`
    ];

    const inputs = getDateInputCandidates(element);
    if (!inputs.length) {
      return { ok: false, reason: `日期值无法写入: ${strValue}` };
    }

    for (const input of inputs) {
      const wasReadonly = input.readOnly;
      const wasDisabled = input.disabled;
      if (wasDisabled) continue;

      if (wasReadonly) input.readOnly = false;

      if ((input.getAttribute('type') || '').toLowerCase() === 'date') {
        setNativeValue(input, iso);
      } else {
        let written = false;
        for (const fmt of variants) {
          setNativeValue(input, fmt);
          if (input.value && (textsMatch(input.value, fmt) || datesEqual(input.value, iso))) {
            written = true;
            break;
          }
        }
        if (!written) {
          setNativeValue(input, variants[0]);
        }
      }

      if (wasReadonly) input.readOnly = wasReadonly;

      dispatchInputEvents(input);
      input.dispatchEvent(new Event('blur', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
      input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));

      const root = input.closest('.el-date-editor, .ant-picker');
      if (root) {
        root.dispatchEvent(new Event('change', { bubbles: true }));
      }

      if (input.value && (datesEqual(input.value, iso) || textsMatch(input.value, strValue))) {
        return { ok: true };
      }
    }

    return { ok: false, reason: `日期值无法写入: ${strValue}` };
  }

  function setNativeValue(element, value) {
    const tag = element.tagName.toLowerCase();
    const proto = tag === 'textarea'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');

    if (descriptor && descriptor.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
  }

  function dispatchInputEvents(element) {
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setFieldValue(element, value, fieldHint) {
    if (element.disabled) {
      return { ok: false, reason: '字段为禁用状态' };
    }

    const strValue = value == null ? '' : String(value);
    const tag = element.tagName.toLowerCase();
    const type = (element.getAttribute('type') || '').toLowerCase();
    const formItem = getFormItemRoot(element);
    const hintType = fieldHint?.type;

    const isDateField = hintType === 'date'
      || element.matches('.el-date-editor, .el-range-editor, .ant-picker, .el-date-picker')
      || formItem?.querySelector('.el-date-editor, .el-range-editor, .ant-picker');

    if (isDateField) {
      const dateResult = setDateValue(element, strValue);
      if (dateResult.ok) return dateResult;
      if (hintType === 'date' || element.matches('.el-date-editor, .el-range-editor, .ant-picker, .el-date-picker')) {
        return dateResult;
      }
    }

    const radioGroup = findRadioGroup(element);
    if (radioGroup) {
      const radioResult = setRadioInGroup(radioGroup, strValue, fieldHint?.options);
      if (radioResult.ok) return radioResult;
      if ((element.getAttribute('type') || '').toLowerCase() === 'radio') return radioResult;
      if (element.matches('.el-radio-group, .ant-radio-group, [role="radiogroup"]')) return radioResult;
      if (radioGroup instanceof Element && (radioGroup === element || radioGroup.contains(element))) {
        return radioResult;
      }
    }

    const checkboxGroup = findCheckboxGroup(element);
    if (checkboxGroup) {
      const checkboxResult = setCheckboxInGroup(checkboxGroup, strValue);
      if (checkboxResult.ok) return checkboxResult;
      if ((element.getAttribute('type') || '').toLowerCase() === 'checkbox') return checkboxResult;
      if (element.matches('.el-checkbox-group, .ant-checkbox-group')) return checkboxResult;
      if (checkboxGroup instanceof Element && (checkboxGroup === element || checkboxGroup.contains(element))) {
        return checkboxResult;
      }
    }

    const uiSelect = findUiSelectRoot(element);
    if (uiSelect) {
      const selectResult = setUiSelectValue(element, strValue);
      if (selectResult.ok) return selectResult;
      if (element.matches('.el-select, .ant-select') || uiSelect === element || uiSelect.contains(element)) {
        return selectResult;
      }
    }

    if (isDatePickerElement(element)
      || element.matches('.el-date-editor, .el-range-editor, .ant-picker, .el-date-picker')
      || formItem?.querySelector('.el-date-editor, .el-range-editor, .ant-picker')) {
      const dateResult = setDateValue(element, strValue);
      if (dateResult.ok) return dateResult;
      if (isDatePickerElement(element) || element.matches('.el-date-editor, .el-range-editor, .ant-picker, .el-date-picker')) {
        return dateResult;
      }
    }

    if (tag === 'select') {
      if (element.multiple) {
        return setSelectMultiple(element, strValue);
      }
      const options = Array.from(element.options);
      let matched = options.find((opt) => textsMatch(opt.value, strValue));
      if (!matched) {
        matched = options.find((opt) => textsMatch(opt.text, strValue));
      }
      if (!matched) {
        return { ok: false, reason: `未找到选项: ${strValue}` };
      }
      element.value = matched.value;
      dispatchInputEvents(element);
      return { ok: true };
    }

    if (tag === 'input' && type === 'checkbox') {
      const group = findCheckboxGroup(element);
      const boxes = getCheckboxesInGroup(group);
      if (boxes.length > 1) {
        return setCheckboxInGroup(group, strValue);
      }
      const checked = ['true', '1', 'yes', 'on', '是'].includes(strValue.toLowerCase());
      element.checked = checked;
      dispatchInputEvents(element);
      return { ok: true };
    }

    if (tag === 'input' && type === 'radio') {
      return setRadioInGroup(findRadioGroup(element), strValue, fieldHint?.options);
    }

    if (element.readOnly && tag !== 'textarea') {
      return { ok: false, reason: '字段为只读状态' };
    }

    if (tag === 'input' || tag === 'textarea') {
      setNativeValue(element, strValue);
      dispatchInputEvents(element);
      return { ok: true };
    }

    if (element.isContentEditable) {
      element.textContent = strValue;
      dispatchInputEvents(element);
      return { ok: true };
    }

    return { ok: false, reason: `不支持的元素类型: ${tag}` };
  }

  function fillForm(data, fieldMappings, fieldHints) {
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    const skipped = [];

    data.forEach((entry) => {
      Object.keys(entry).forEach((key) => {
        const locator = fieldMappings[key];
        if (!locator) {
          errors.push({ field: key, reason: '没有定位映射' });
          errorCount++;
          return;
        }

        const element = resolveElement(locator, document, key);
        if (!element) {
          const loc = typeof locator === 'string' ? locator : (locator.primary || locator.css);
          errors.push({ field: key, xpath: loc, reason: '未找到元素' });
          errorCount++;
          return;
        }

        const result = setFieldValue(element, entry[key] || '', fieldHints?.[key]);
        if (result.ok) {
          successCount++;
        } else {
          skipped.push({ field: key, reason: result.reason });
          errorCount++;
        }
      });
    });

    return { successCount, errorCount, errors, skipped };
  }

  window.WebFormFillEngine = {
    fillForm,
    setFieldValue,
    resolveElement,
    resolveByLabelText
  };
})();
