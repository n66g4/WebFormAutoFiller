const WebFormDiagnostics = {
  describeElement(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return null;
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      className: typeof el.className === 'string' ? el.className : null,
      role: el.getAttribute('role'),
      name: el.getAttribute('name'),
      type: el.getAttribute('type'),
      forAttr: el.getAttribute('for'),
      ariaLabelledby: el.getAttribute('aria-labelledby'),
      textPreview: String(el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160)
    };
  },

  getDocName(doc) {
    try {
      const frameEl = doc.defaultView?.frameElement;
      if (frameEl) {
        return `iframe: ${doc.location?.href || 'about:blank'}`;
      }
      return doc.location?.href || 'main-document';
    } catch (e) {
      return 'document';
    }
  },

  diagnoseField(label, locator, key, doc) {
    doc = doc || document;
    const docName = this.getDocName(doc);
    const steps = [];

    let el = WebFormFieldType.findFormControlByLabel(label, doc);
    steps.push({
      step: 'findFormControlByLabel',
      found: !!el,
      element: this.describeElement(el)
    });

    if (!el) {
      el = WebFormFieldType.resolveByLocator(locator, doc);
      steps.push({
        step: 'resolveByLocator',
        locator: WebFormFieldType.locatorToString(locator),
        found: !!el,
        element: this.describeElement(el)
      });
    }

    const radioGroup = el ? WebFormFieldType.findRadioGroupRoot(el, doc) : null;
    steps.push({
      step: 'findRadioGroupRoot',
      found: !!radioGroup,
      element: this.describeElement(radioGroup)
    });

    const scope = radioGroup || el;
    const optionElements = scope ? WebFormFieldType.collectRadioOptionElements(scope) : [];
    const optionLabelsFromSpans = scope ? WebFormFieldType.collectRadioLabelTexts(scope) : [];
    const optionLabelsFromNodes = optionElements
      .map((node) => WebFormFieldType.getOptionLabel(node))
      .filter(Boolean);
    const probedMeta = WebFormFieldType.probeFieldMeta(label, locator, doc);

    const matchedFormItems = [];
    doc.querySelectorAll('.el-form-item, .ant-form-item, [class*="form-item"]').forEach((item) => {
      const labelEl = item.querySelector('.el-form-item__label, .ant-form-item-label');
      if (!labelEl || labelEl.closest('.el-radio-group, .ant-radio-group')) return;
      if (!WebFormFieldType.labelsMatch(labelEl.textContent, label)) return;

      const radio = item.querySelector('.el-radio-group, .ant-radio-group, [role="radiogroup"]');
      matchedFormItems.push({
        labelText: WebFormFieldType.normalizeFieldLabel(labelEl.textContent),
        labelElement: this.describeElement(labelEl),
        hasRadioGroup: !!radio,
        radioGroup: this.describeElement(radio),
        radioLabels: radio ? WebFormFieldType.collectRadioLabelTexts(radio) : []
      });
    });

    const issues = [];
    if (!el && !matchedFormItems.length) {
      issues.push('未找到表单项或控件');
    }
    if (matchedFormItems.length && !matchedFormItems.some((item) => item.hasRadioGroup) && probedMeta.type === 'radio') {
      issues.push('匹配到表单项但未发现单选组');
    }
    if (probedMeta.type === 'radio' && !probedMeta.options.length) {
      issues.push('识别为单选但未采集到选项文字');
    }
    if (optionLabelsFromSpans.length && !probedMeta.options.length) {
      issues.push(`DOM 中有选项 ${optionLabelsFromSpans.join(', ')}，但未写入 probedMeta`);
    }

    return {
      key,
      label,
      doc: docName,
      configLocator: WebFormFieldType.locatorToString(locator),
      matchedFormItems,
      steps,
      optionElementCount: optionElements.length,
      optionLabelsFromNodes,
      optionLabelsFromSpans,
      probedMeta,
      issues
    };
  },

  diagnoseDocument(mappings, fieldMappings, fieldMeta, doc) {
    const fields = Object.entries(mappings).map(([key, label]) => {
      const locator = fieldMappings[label];
      const detail = this.diagnoseField(label, locator, key, doc);
      return {
        ...detail,
        configMeta: fieldMeta?.[key] || null
      };
    });

    return {
      doc: this.getDocName(doc),
      title: doc.title || '',
      fieldCount: fields.length,
      fields
    };
  },

  diagnoseAll(mappings, fieldMappings, fieldMeta) {
    const docs = WebFormFieldType.getSearchableDocuments(document);
    const documents = docs.map((doc) => this.diagnoseDocument(mappings, fieldMappings, fieldMeta, doc));

    const summary = Object.keys(mappings).map((key) => {
      const label = mappings[key];
      const perDoc = documents.map((docReport) => docReport.fields.find((f) => f.key === key)).filter(Boolean);

      const withOptions = perDoc.find((f) => f.probedMeta?.options?.length);
      const withControl = perDoc.find((f) => f.steps.some((s) => s.found) || f.matchedFormItems.length);
      const best = withOptions || withControl || perDoc[0] || null;

      const issues = [...new Set(perDoc.flatMap((f) => f.issues || []))];
      if (!withOptions && (best?.configMeta?.type === 'radio' || best?.probedMeta?.type === 'radio')) {
        issues.push('所有文档均未采集到单选选项');
      }
      if (!withControl) {
        issues.push('所有文档均未定位到控件');
      }

      return {
        key,
        label,
        configMeta: fieldMeta?.[key] || null,
        bestDoc: best?.doc || null,
        probedMeta: best?.probedMeta || null,
        optionLabelsFromSpans: best?.optionLabelsFromSpans || [],
        matchedFormItemCount: perDoc.reduce((n, f) => n + (f.matchedFormItems?.length || 0), 0),
        issues
      };
    });

    return {
      pageUrl: document.location?.href || '',
      pageTitle: document.title || '',
      documentCount: documents.length,
      documents,
      summary
    };
  }
};

if (typeof globalThis !== 'undefined') {
  globalThis.WebFormDiagnostics = WebFormDiagnostics;
}
