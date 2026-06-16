const WebFormDomLabel = {
  normalizeLabelText(text) {
    if (!text) return '';
    return text.replace(/\s+/g, ' ').replace(/[:：]\s*$/, '').trim();
  },

  findLabel(input, doc) {
    let parent = input.parentElement;
    while (parent && parent !== doc.body && parent !== doc.documentElement) {
      if (parent.classList && (
        parent.classList.contains('el-form-item')
        || parent.classList.contains('ant-form-item')
      )) {
        const uiLabel = parent.querySelector(
          '.el-form-item__label, .ant-form-item-label label, .ant-form-item-label, label'
        );
        if (uiLabel) {
          const text = this.normalizeLabelText(uiLabel.textContent);
          if (text) return text;
        }
      }
      parent = parent.parentElement;
    }

    if (input.id) {
      try {
        const escaped = typeof CSS !== 'undefined' && CSS.escape
          ? CSS.escape(input.id)
          : input.id;
        const label = doc.querySelector(`label[for="${escaped}"]`);
        if (label) {
          const text = this.normalizeLabelText(label.textContent);
          if (text) return text;
        }
      } catch (e) {
        const label = doc.querySelector(`label[for="${input.id}"]`);
        if (label) {
          const text = this.normalizeLabelText(label.textContent);
          if (text) return text;
        }
      }
    }

    parent = input.parentElement;
    while (parent && parent !== doc.body && parent !== doc.documentElement) {
      const label = parent.querySelector('label');
      if (label && label !== input) {
        const text = this.normalizeLabelText(label.textContent);
        if (text) return text;
      }
      parent = parent.parentElement;
    }

    let prev = input.previousElementSibling;
    while (prev) {
      if (prev.tagName === 'LABEL') {
        const text = prev.textContent.trim();
        if (text) return text;
      }
      const labelInPrev = prev.querySelector('label');
      if (labelInPrev) {
        const text = labelInPrev.textContent.trim();
        if (text) return text;
      }
      prev = prev.previousElementSibling;
    }

    parent = input.parentElement;
    if (parent) {
      const textNodes = Array.from(parent.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent.trim())
        .filter((text) => text.length > 0);

      if (textNodes.length > 0) {
        return textNodes[0];
      }

      const prevSibling = parent.previousElementSibling;
      if (prevSibling) {
        const text = prevSibling.textContent.trim();
        if (text && text.length < 50) return text;
      }
    }

    return null;
  },

  getElementText(element) {
    if (!element) return '';
    const text = element.innerText || element.textContent || '';
    return text.trim().replace(/\s+/g, ' ');
  },

  getElementPreview(element) {
    const text = this.getElementText(element);
    if (text) return text.substring(0, 60);
    if (element.placeholder) return element.placeholder;
    if (element.value) return element.value;
    return '';
  }
};
