const WebFormFieldType = {
  TYPES: {
    TEXT: 'text',
    TEXTAREA: 'textarea',
    NUMBER: 'number',
    DATE: 'date',
    RADIO: 'radio',
    SELECT: 'select',
    MULTISELECT: 'multiselect',
    CHECKBOX: 'checkbox'
  },

  normalizeLabelText(text) {
    if (!text) return '';
    return String(text).replace(/\s+/g, ' ').replace(/[:：]\s*$/, '').trim();
  },

  uniqueOptions(options) {
    const seen = new Set();
    const result = [];
    (options || []).forEach((opt) => {
      const text = this.normalizeLabelText(opt);
      if (!text || seen.has(text)) return;
      seen.add(text);
      result.push(text);
    });
    return result;
  },

  locatorToString(locator) {
    if (!locator) return '';
    if (typeof locator === 'string') return locator;
    return [locator.primary, locator.fallback, locator.xpath, locator.css]
      .filter(Boolean)
      .join(' ');
  },

  inferFromLocator(locator, key, label) {
    const locStr = this.locatorToString(locator);
    const s = locStr.toLowerCase();
    const keyText = String(key || '');
    const labelText = String(label || '');

    let type = this.TYPES.TEXT;

    if (/\/textarea|textarea\[/i.test(locStr)) {
      type = this.TYPES.TEXTAREA;
    } else if (/el-date-editor|ant-picker|type=["']date["']/i.test(locStr)) {
      type = this.TYPES.DATE;
    } else if (/el-radio-group|ant-radio-group|ivu-radio-group|arco-radio-group|n-radio-group|radiogroup/i.test(locStr)) {
      type = this.TYPES.RADIO;
    } else if (/el-checkbox-group|ant-checkbox-group/i.test(locStr)) {
      type = this.TYPES.MULTISELECT;
    } else if (/el-select--multiple|ant-select-multiple|multiple/i.test(locStr)) {
      type = this.TYPES.MULTISELECT;
    } else if (/el-select|ant-select/i.test(locStr)) {
      type = this.TYPES.SELECT;
    } else if (/type=["']checkbox["']/i.test(locStr) && !/checkbox-group/i.test(locStr)) {
      type = this.TYPES.CHECKBOX;
    } else if (
      (keyText.includes('T') && (keyText.includes('时限') || keyText.endsWith('T')))
      || labelText.includes('时限')
      || /type=["']number["']/i.test(locStr)
    ) {
      type = this.TYPES.NUMBER;
    }

    return { type, options: [] };
  },

  resolveMeta(config, key, label) {
    if (config?.fieldMeta?.[key]) {
      const meta = config.fieldMeta[key];
      return {
        type: meta.type || this.TYPES.TEXT,
        options: this.uniqueOptions(meta.options)
      };
    }

    const locator = config?.fieldMappings?.[label];
    return this.inferFromLocator(locator, key, label);
  },

  getOptionLabel(element) {
    if (!element) return '';

    if (element.tagName === 'INPUT') {
      const type = (element.getAttribute('type') || '').toLowerCase();
      if (type === 'radio' || type === 'checkbox') {
        const controlLabel = element.closest(
          'label.el-radio, label.el-checkbox, label.el-radio-button, label.ant-radio-wrapper, label.ant-checkbox-wrapper, label'
        );
        if (controlLabel) {
          const span = this.getExplicitLabelSpan(controlLabel);
          const text = this.normalizeLabelText(span ? span.textContent : controlLabel.textContent);
          if (text) return text;
        }
      }
    }

    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) return this.normalizeLabelText(ariaLabel);

    if (element.getAttribute('role') === 'radio') {
      const labelledBy = element.getAttribute('aria-labelledby');
      if (labelledBy) {
        const ref = element.ownerDocument.getElementById(labelledBy);
        if (ref) return this.normalizeLabelText(ref.textContent);
      }
      return this.normalizeLabelText(element.textContent);
    }

    const innerLabel = this.getExplicitLabelSpan(element);
    if (innerLabel) return this.normalizeLabelText(innerLabel.textContent);

    const label = element.closest('label');
    if (label) {
      const span = this.getExplicitLabelSpan(label);
      const text = span ? span.textContent : label.textContent;
      return this.normalizeLabelText(text);
    }

    const wrapper = element.closest(
      '.el-radio, .el-radio-button, .el-checkbox, .el-checkbox-button, .ant-radio-wrapper, .ant-checkbox-wrapper, .ivu-radio-wrapper, .arco-radio, .n-radio, .t-radio-button'
    );
    if (wrapper) {
      const span = this.getExplicitLabelSpan(wrapper);
      if (span) return this.normalizeLabelText(span.textContent);
      return this.normalizeLabelText(wrapper.textContent);
    }

    if (element.tagName === 'INPUT') {
      const type = (element.getAttribute('type') || '').toLowerCase();
      if (type !== 'radio' && type !== 'checkbox') {
        return this.normalizeLabelText(element.value);
      }
    }

    return this.normalizeLabelText(element.textContent);
  },

  normalizeFieldLabel(text) {
    return this.normalizeLabelText(text).replace(/[*＊]/g, '').trim();
  },

  labelsMatch(pageText, configText) {
    const a = this.normalizeFieldLabel(pageText);
    const b = this.normalizeFieldLabel(configText);
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.length <= 2 && b.length > 4) return false;
    if (b.length <= 2 && a.length > 4) return false;
    return a.includes(b) || b.includes(a);
  },

  getExplicitLabelSpan(element) {
    if (!element) return null;
    if (element.matches?.('.el-radio__label, .el-checkbox__label, .el-radio-button__inner, .el-checkbox-button__inner')) {
      return element;
    }
    return element.querySelector?.(
      '.el-radio__label, .el-checkbox__label, .el-radio-button__inner, .el-checkbox-button__inner, .arco-radio-label, .n-radio__label, .t-radio__label, .ivu-radio-wrapper-text, .ant-radio + span, .ant-checkbox + span'
    );
  },

  getSearchableDocuments(rootDoc) {
    const doc = rootDoc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return [];

    const docs = [doc];
    doc.querySelectorAll('iframe').forEach((frame) => {
      try {
        if (frame.contentDocument) docs.push(frame.contentDocument);
      } catch (e) {
        // cross-origin iframe
      }
    });
    return docs;
  },

  collectRadioLabelTexts(group) {
    if (!group) return [];
    const labels = Array.from(group.querySelectorAll('.el-radio__label, .el-radio-button__inner'));
    if (labels.length) {
      return this.uniqueOptions(
        labels.map((el) => this.normalizeLabelText(el.textContent)).filter(Boolean)
      );
    }
    return [];
  },

  findFormControlByLabel(labelText, doc) {
    doc = doc || document;
    const label = this.normalizeFieldLabel(labelText);
    if (!label) return null;

    const matchedItems = [];
    doc.querySelectorAll('.el-form-item, .ant-form-item, [class*="form-item"]').forEach((item) => {
      const labelEl = item.querySelector('.el-form-item__label, .ant-form-item-label');
      if (!labelEl || labelEl.closest('.el-radio-group, .ant-radio-group')) return;
      if (!this.labelsMatch(labelEl.textContent, label)) return;
      matchedItems.push({ item, labelEl });
    });

    const resolveFromItem = ({ item, labelEl }) => {
      const dateRoot = item.querySelector('.el-date-editor, .el-range-editor, .ant-picker');
      if (dateRoot) return dateRoot;

      const forId = labelEl.getAttribute('for');
      if (forId) {
        const target = doc.getElementById(forId);
        if (target) {
          return this.findRadioGroupRoot(target, doc) || target;
        }
      }

      if (labelEl.id) {
        const labelled = doc.querySelector(`[aria-labelledby="${labelEl.id}"]`);
        if (labelled) {
          return this.findRadioGroupRoot(labelled, doc) || labelled;
        }
      }

      const radioGroup = item.querySelector('.el-radio-group, .ant-radio-group, [role="radiogroup"]');
      if (radioGroup) return radioGroup;

      const checkboxGroup = item.querySelector('.el-checkbox-group, .ant-checkbox-group');
      if (checkboxGroup) return checkboxGroup;

      const uiSelect = item.querySelector('.el-select, .ant-select');
      if (uiSelect) return uiSelect;

      return item.querySelector('.el-form-item__content, .ant-form-item-control-input-content') || item;
    };

    for (const entry of matchedItems) {
      const control = resolveFromItem(entry);
      if (!control) continue;
      const options = this.collectRadioOptions(control, doc);
      if (options.length) return control;
    }

    for (const entry of matchedItems) {
      const control = resolveFromItem(entry);
      if (control) return control;
    }

    return null;
  },

  resolveControlByFormLabel(labelText, doc) {
    return this.findFormControlByLabel(labelText, doc);
  },

  isXPath(selector) {
    if (!selector || typeof selector !== 'string') return false;
    const s = selector.trim();
    return s.startsWith('/') || s.startsWith('(');
  },

  resolveByLocator(locator, doc) {
    doc = doc || document;
    const candidates = [];
    if (typeof locator === 'string') {
      candidates.push(locator);
    } else if (locator) {
      ['primary', 'css', 'fallback', 'xpath', 'legacy'].forEach((key) => {
        if (locator[key]) candidates.push(locator[key]);
      });
    }

    for (const sel of candidates) {
      if (!sel) continue;
      try {
        let node = null;
        if (this.isXPath(sel)) {
          node = doc.evaluate(
            sel,
            doc,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
          ).singleNodeValue;
        } else {
          node = doc.querySelector(sel);
        }
        if (!node) continue;

        const radio = this.findRadioGroupRoot(node, doc);
        if (radio) return radio;

        if (node.matches?.('.el-checkbox-group, .ant-checkbox-group')) return node;
        const checkbox = node.closest?.('.el-checkbox-group, .ant-checkbox-group');
        if (checkbox) return checkbox;

        if (node.matches?.('.el-select, .ant-select')) return node;
        const uiSelect = node.closest?.('.el-select, .ant-select');
        if (uiSelect) return uiSelect;

        if (node.matches?.('.el-date-editor, .el-range-editor, .ant-picker, .el-radio-group, .ant-radio-group, [role="radiogroup"]')) {
          return node;
        }

        return node;
      } catch (e) {
        // try next locator
      }
    }

    return null;
  },

  probeFieldMeta(label, locator, doc, configMeta) {
    doc = doc || document;
    let el = this.findFormControlByLabel(label, doc);
    if (!el) {
      el = this.resolveByLocator(locator, doc);
    } else {
      const isDateEl = el.matches?.('.el-date-editor, .el-range-editor, .ant-picker, .el-date-picker')
        || el.querySelector?.('.el-date-editor, .el-range-editor, .ant-picker');
      if (!isDateEl) {
        const grouped = this.findRadioGroupRoot(el, doc);
        if (grouped) el = grouped;
      }
    }

    if (!el) {
      const inferred = this.inferFromLocator(locator, '', label);
      if (configMeta?.type === this.TYPES.DATE || /期限|日期/.test(label)) {
        return { type: this.TYPES.DATE, options: [] };
      }
      return { type: inferred.type, options: [] };
    }

    const meta = this.detectFromElement(el, doc);
    if (configMeta?.type === this.TYPES.DATE && meta.type === this.TYPES.RADIO) {
      return { type: this.TYPES.DATE, options: [] };
    }
    if (
      (meta.type === this.TYPES.RADIO || meta.type === this.TYPES.MULTISELECT)
      && !meta.options.length
    ) {
      const labelTexts = this.collectRadioLabelTexts(
        this.findRadioGroupRoot(el, doc) || el
      );
      if (labelTexts.length) {
        meta.options = labelTexts;
      }
    }

    if (meta.type === this.TYPES.TEXT) {
      const inferred = this.inferFromLocator(locator, '', label);
      if (inferred.type !== this.TYPES.TEXT) {
        meta.type = inferred.type;
      }
    }
    return meta;
  },

  findRadioGroupRoot(element, doc) {
    doc = doc || element.ownerDocument;
    if (!element) return null;

    const groupSelectors = [
      '.el-radio-group',
      '.ant-radio-group',
      '.ivu-radio-group',
      '.arco-radio-group',
      '.n-radio-group',
      '.t-radio-group',
      '.van-radio-group',
      '[role="radiogroup"]'
    ];

    for (const sel of groupSelectors) {
      if (element.matches(sel)) return element;
      const closest = element.closest(sel);
      if (closest) return closest;
    }

    const formItem = element.closest('.el-form-item, .ant-form-item, .ivu-form-item, [class*="form-item"]');
    if (formItem) {
      for (const sel of groupSelectors) {
        const found = formItem.querySelector(sel);
        if (found) return found;
      }

      const content = formItem.querySelector(
        '.el-form-item__content, .ant-form-item-control-input-content, .ivu-form-item-content'
      ) || formItem;
      const optionCount = content.querySelectorAll(
        'input[type="radio"], [role="radio"], label.el-radio, .el-radio, label.ant-radio-wrapper, .ant-radio-wrapper, .ivu-radio-wrapper, label.arco-radio, .arco-radio, [class*="radio"]'
      ).length;
      if (optionCount >= 2) return content;

      const directOptions = Array.from(content.children).filter((child) => {
        if (child.nodeType !== Node.ELEMENT_NODE) return false;
        const text = this.normalizeLabelText(child.textContent);
        if (!text || text.length > 40) return false;
        return !child.querySelector('input:not([type="hidden"]), textarea, select');
      });
      if (directOptions.length >= 2) return content;
    }

    return null;
  },

  optionTextsMatch(optionText, needle) {
    const x = this.normalizeCompareText(optionText);
    const y = this.normalizeCompareText(needle);
    if (!x || !y) return false;
    if (x === y) return true;
    if (Math.min(x.length, y.length) <= 2) return false;
    return x.includes(y) || y.includes(x);
  },

  expandRadioGroupScope(group) {
    if (!group) return group;
    let root = group;
    for (let depth = 0; depth < 4; depth++) {
      if (this._collectRadioOptionElementsRaw(root).length >= 2) return root;
      if (root.children.length === 1 && root.children[0].nodeType === Node.ELEMENT_NODE) {
        root = root.children[0];
        continue;
      }
      break;
    }
    return root;
  },

  findRadioCandidatesByText(group, strValue, hintOptions) {
    const needles = this.uniqueOptions([strValue, ...(hintOptions || [])]);
    if (!group || !needles.length) return [];

    const scope = this.expandRadioGroupScope(group);
    const found = [];
    const seen = new Set();

    scope.querySelectorAll('label, [role="radio"], input[type="radio"], [class*="radio"], button, span, div, a').forEach((el) => {
      if (!el || seen.has(el)) return;
      if (el.closest('[class*="dropdown"], [class*="popover"], [class*="tooltip"], [class*="select-dropdown"]')) return;

      const text = this.getOptionLabel(el);
      if (!text) return;
      if (!needles.some((needle) => this.optionTextsMatch(text, needle))) return;

      seen.add(el);
      found.push(el);
    });

    return found.filter((el) =>
      !found.some((other) => other !== el && other.contains(el))
    );
  },

  _collectRadioOptionElementsRaw(group) {
    if (!group) return [];

    const candidates = [];
    const seen = new Set();

    function add(el) {
      if (!el || el.nodeType !== Node.ELEMENT_NODE || seen.has(el)) return;
      seen.add(el);
      candidates.push(el);
    }

    const itemSelectors = [
      'label.el-radio',
      'label.el-radio-button',
      'label.ant-radio-wrapper',
      'label.ant-radio-button-wrapper',
      'label.ivu-radio-wrapper',
      'label.arco-radio',
      'label.n-radio',
      'label.t-radio-button',
      '[role="radio"]',
      'input[type="radio"]',
      '.el-radio-button',
      '.ant-radio-wrapper',
      '.ivu-radio-wrapper',
      '.arco-radio',
      '.n-radio',
      '.t-radio-button'
    ];

    itemSelectors.forEach((sel) => {
      try {
        group.querySelectorAll(sel).forEach((el) => {
          if (el.classList.contains('el-radio-button__inner')) return;
          if (el.classList.contains('el-radio__inner')) return;
          if (el.classList.contains('el-radio__input')) return;
          if (el.classList.contains('el-radio__original')) return;
          if (el.classList.contains('ant-radio') && el.closest('.ant-radio-wrapper')) return;
          if (el.matches('input[type="radio"]') && el.closest('label.el-radio, label.el-radio-button')) return;
          add(el);
        });
      } catch (e) {
        // ignore invalid selector
      }
    });

    if (!candidates.length) {
      group.querySelectorAll('[role="radio"]').forEach(add);
    }

    if (!candidates.length) {
      Array.from(group.children).forEach((child) => {
        if (child.nodeType !== Node.ELEMENT_NODE) return;
        const text = this.normalizeLabelText(child.textContent);
        if (!text || text.length > 40) return;
        if (child.querySelector('input:not([type="hidden"]), textarea, select')) return;
        add(child);
      });
    }

    return candidates.filter((el) =>
      !candidates.some((other) => other !== el && other.contains(el))
    );
  },

  collectRadioOptionElements(group) {
    return this._collectRadioOptionElementsRaw(this.expandRadioGroupScope(group));
  },

  collectRadioClickTargets(group) {
    group = this.expandRadioGroupScope(group);
    if (!group) return [];

    const targets = this._collectRadioOptionElementsRaw(group)
      .filter((el) => this.getOptionLabel(el));

    if (targets.length) return targets;

    return Array.from(group.querySelectorAll('.el-radio__label, .el-radio-button__inner'))
      .map((span) => span.closest('label.el-radio, label.el-radio-button, label'))
      .filter(Boolean);
  },

  collectRadioOptions(element, doc) {
    const group = this.findRadioGroupRoot(element, doc);
    if (!group) return [];

    const nodes = this.collectRadioOptionElements(group);
    let options = this.uniqueOptions(
      nodes.map((node) => this.getOptionLabel(node)).filter(Boolean)
    );
    if (!options.length) {
      options = this.collectRadioLabelTexts(group);
    }
    return options;
  },

  collectCheckboxOptions(element, doc) {
    doc = doc || element.ownerDocument;
    const group = element.closest('.el-checkbox-group, .ant-checkbox-group')
      || (element.matches('.el-checkbox-group, .ant-checkbox-group') ? element : null);
    if (!group) return [];

    return this.uniqueOptions(
      Array.from(group.querySelectorAll('input[type="checkbox"]')).map((box) => this.getOptionLabel(box))
    );
  },

  collectNativeSelectOptions(element) {
    if (!element || element.tagName.toLowerCase() !== 'select') return [];
    return this.uniqueOptions(
      Array.from(element.options)
        .filter((opt) => !opt.disabled && opt.value !== '')
        .map((opt) => this.normalizeLabelText(opt.text) || opt.value)
    );
  },

  collectUiSelectOptions(selectRoot, doc) {
    doc = doc || selectRoot.ownerDocument;
    const controls = selectRoot.querySelectorAll('input, .ant-select-selector');
    for (const control of controls) {
      const controlId = control.getAttribute('aria-controls');
      if (!controlId) continue;
      const panel = doc.getElementById(controlId);
      if (!panel) continue;
      const items = panel.querySelectorAll(
        '.el-select-dropdown__item:not(.is-disabled), .ant-select-item-option:not(.ant-select-item-option-disabled)'
      );
      if (items.length) {
        return this.uniqueOptions(Array.from(items).map((item) => item.textContent));
      }
    }

    const items = doc.querySelectorAll(
      '.el-select-dropdown__item:not(.is-disabled), .ant-select-item-option:not(.ant-select-item-option-disabled)'
    );
    return this.uniqueOptions(Array.from(items).map((item) => item.textContent));
  },

  openUiSelect(selectRoot) {
    const trigger = selectRoot.querySelector('.el-select__wrapper, .el-input__wrapper, .el-input, .ant-select-selector')
      || selectRoot;
    trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    trigger.click();
  },

  detectFromElement(element, doc) {
    doc = doc || element.ownerDocument;
    if (!element) return { type: this.TYPES.TEXT, options: [] };

    const tag = element.tagName.toLowerCase();
    const inputType = (element.getAttribute('type') || '').toLowerCase();

    if (element.matches('.el-date-editor, .el-range-editor, .ant-picker, .el-date-picker')
      || element.closest('.el-date-editor, .el-range-editor, .ant-picker, .el-date-picker')
      || inputType === 'date' || inputType === 'datetime-local') {
      return { type: this.TYPES.DATE, options: [] };
    }

    if (element.matches('.el-radio-group, .ant-radio-group, [role="radiogroup"]')
      || (inputType === 'radio' && this.findRadioGroupRoot(element, doc))) {
      return { type: this.TYPES.RADIO, options: this.collectRadioOptions(element, doc) };
    }

    if (element.matches('.el-checkbox-group, .ant-checkbox-group')
      || (inputType === 'checkbox' && element.closest('.el-checkbox-group, .ant-checkbox-group'))) {
      return { type: this.TYPES.MULTISELECT, options: this.collectCheckboxOptions(element, doc) };
    }

    const uiSelect = element.closest('.el-select, .ant-select')
      || (element.matches('.el-select, .ant-select') ? element : null);
    if (uiSelect) {
      let options = this.collectUiSelectOptions(uiSelect, doc);
      if (!options.length) {
        this.openUiSelect(uiSelect);
        options = this.collectUiSelectOptions(uiSelect, doc);
      }
      const isMultiple = uiSelect.classList.contains('el-select--multiple')
        || uiSelect.classList.contains('ant-select-multiple')
        || !!uiSelect.querySelector('.el-select__tags, .ant-select-selection-overflow');
      return {
        type: isMultiple ? this.TYPES.MULTISELECT : this.TYPES.SELECT,
        options
      };
    }

    if (element.matches('.el-date-editor, .ant-picker, .el-date-picker')
      || element.closest('.el-date-editor, .ant-picker, .el-date-picker')
      || inputType === 'date' || inputType === 'datetime-local') {
      return { type: this.TYPES.DATE, options: [] };
    }

    if (tag === 'select') {
      const options = this.collectNativeSelectOptions(element);
      return {
        type: element.multiple ? this.TYPES.MULTISELECT : this.TYPES.SELECT,
        options
      };
    }

    if (tag === 'textarea' || element.isContentEditable) {
      return { type: this.TYPES.TEXTAREA, options: [] };
    }

    if (inputType === 'checkbox') {
      return { type: this.TYPES.CHECKBOX, options: [] };
    }

    if (inputType === 'radio') {
      return { type: this.TYPES.RADIO, options: this.collectRadioOptions(element, doc) };
    }

    const radioGroup = this.findRadioGroupRoot(element, doc);
    if (radioGroup) {
      const options = this.collectRadioOptions(element, doc);
      if (options.length) {
        return { type: this.TYPES.RADIO, options };
      }
    }

    if (inputType === 'number') {
      return { type: this.TYPES.NUMBER, options: [] };
    }

    return { type: this.TYPES.TEXT, options: [] };
  }
};

if (typeof globalThis !== 'undefined') {
  globalThis.WebFormFieldType = WebFormFieldType;
}
