const WebFormLocator = {
  isXPath(selector) {
    if (!selector || typeof selector !== 'string') return false;
    const s = selector.trim();
    return s.startsWith('/') || s.startsWith('(');
  },

  normalizeLabelText(text) {
    if (!text) return '';
    return text.replace(/\s+/g, ' ').replace(/[:：]\s*$/, '').trim();
  },

  escapeXPathLiteral(str) {
    if (!str.includes("'")) return `'${str}'`;
    if (!str.includes('"')) return `"${str}"`;
    const parts = str.split("'");
    return parts.map((part) => `'${part}'`).join(', "\'", ');
  },

  isStableId(id) {
    if (!id || !id.trim()) return false;
    const unstablePatterns = [
      /^el-id-/i,
      /^ext-gen/i,
      /^react-/i,
      /^vue-/i,
      /^v-id-/i,
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,
      /^[a-f0-9]{24,}$/i,
      /^\d+$/,
      /^:r[0-9a-z]+:$/i
    ];
    return !unstablePatterns.some((pattern) => pattern.test(id));
  },

  toLocator(locator) {
    if (!locator) {
      return { primary: null, fallback: null, strategy: null, labelText: null };
    }
    if (typeof locator === 'string') {
      return {
        primary: locator,
        fallback: null,
        strategy: this.isXPath(locator) ? 'xpath' : 'css',
        labelText: null
      };
    }
    return {
      primary: locator.primary || locator.css || null,
      fallback: locator.fallback || locator.xpath || locator.legacy || null,
      strategy: locator.strategy || (locator.css ? 'css' : null),
      labelText: locator.labelText || null
    };
  },

  locatorToString(locator) {
    const { primary, fallback, strategy, labelText } = this.toLocator(locator);
    const prefix = strategy === 'label-xpath' ? '标签: ' : strategy === 'css' ? 'CSS: ' : '';
    let text = primary ? `${prefix}${primary}` : '';
    if (labelText && strategy === 'label-xpath') {
      text = `标签「${labelText}」`;
    }
    if (fallback && fallback !== primary) {
      text += ` (备用: ${fallback})`;
    }
    return text;
  },

  locatorToStorage(locator) {
    const { primary, fallback, strategy, labelText } = this.toLocator(locator);
    if (!primary && !labelText) return null;

    const stored = {};
    if (primary) stored.primary = primary;
    if (fallback && fallback !== primary) stored.fallback = fallback;
    if (labelText) stored.labelText = labelText;
    if (strategy) stored.strategy = strategy;

    if (Object.keys(stored).length === 1 && stored.primary) {
      return stored.primary;
    }
    return stored;
  },

  cssEscapeAttr(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  },

  buildCssSelector(element, doc) {
    doc = doc || element.ownerDocument;

    if (element.id && this.isStableId(element.id)) {
      try {
        const escaped = typeof CSS !== 'undefined' && CSS.escape
          ? CSS.escape(element.id)
          : element.id.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
        const sel = `#${escaped}`;
        if (doc.querySelectorAll(sel).length === 1) return sel;
      } catch (e) {
        // ignore
      }
    }

    const name = element.getAttribute('name');
    if (name) {
      const tag = element.tagName.toLowerCase();
      const sel = `${tag}[name="${this.cssEscapeAttr(name)}"]`;
      try {
        if (doc.querySelectorAll(sel).length === 1) return sel;
      } catch (e) {
        // ignore
      }
    }

    const dataAttrs = ['data-field', 'data-name', 'data-key', 'data-testid', 'data-test'];
    for (const attr of dataAttrs) {
      const val = element.getAttribute(attr);
      if (!val) continue;
      const sel = `[${attr}="${this.cssEscapeAttr(val)}"]`;
      try {
        if (doc.querySelectorAll(sel).length === 1) return sel;
      } catch (e) {
        // ignore
      }
    }

    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) {
      const tag = element.tagName.toLowerCase();
      const sel = `${tag}[aria-label="${this.cssEscapeAttr(ariaLabel)}"]`;
      try {
        if (doc.querySelectorAll(sel).length === 1) return sel;
      } catch (e) {
        // ignore
      }
    }

    const placeholder = element.getAttribute('placeholder');
    const tag = element.tagName.toLowerCase();
    if (placeholder && (tag === 'input' || tag === 'textarea')) {
      const sel = `${tag}[placeholder="${this.cssEscapeAttr(placeholder)}"]`;
      try {
        if (doc.querySelectorAll(sel).length === 1) return sel;
      } catch (e) {
        // ignore
      }
    }

    return null;
  },

  buildLabelXPathCandidates(label) {
    const lit = this.escapeXPathLiteral(label);
    return [
      `//div[contains(@class,"el-form-item")][.//*[contains(@class,"el-form-item__label") and contains(normalize-space(.), ${lit})]]//div[contains(@class,"el-radio-group")][1]`,
      `//div[contains(@class,"el-form-item")][.//*[contains(@class,"el-form-item__label") and contains(normalize-space(.), ${lit})]]//div[contains(@class,"el-checkbox-group")][1]`,
      `//div[contains(@class,"el-form-item")][.//*[contains(@class,"el-form-item__label") and contains(normalize-space(.), ${lit})]]//div[contains(@class,"el-select")][1]`,
      `//div[contains(@class,"el-form-item")][.//*[contains(@class,"el-form-item__label") and contains(normalize-space(.), ${lit})]]//div[contains(@class,"el-date-editor")]//input[1]`,
      `//div[contains(@class,"el-form-item")][.//*[contains(@class,"el-form-item__label") and contains(normalize-space(.), ${lit})]]//div[contains(@class,"ant-picker")]//input[1]`,
      `//div[contains(@class,"el-form-item")][.//*[contains(@class,"el-form-item__label") and contains(normalize-space(.), ${lit})]]//input[not(@type="hidden")][1]`,
      `//div[contains(@class,"el-form-item")][.//*[contains(@class,"el-form-item__label") and contains(normalize-space(.), ${lit})]]//textarea[1]`,
      `//div[contains(@class,"ant-form-item")][.//*[contains(@class,"ant-form-item-label") and contains(normalize-space(.), ${lit})]]//div[contains(@class,"ant-radio-group")][1]`,
      `//div[contains(@class,"ant-form-item")][.//*[contains(@class,"ant-form-item-label") and contains(normalize-space(.), ${lit})]]//div[contains(@class,"ant-checkbox-group")][1]`,
      `//div[contains(@class,"ant-form-item")][.//*[contains(@class,"ant-form-item-label") and contains(normalize-space(.), ${lit})]]//div[contains(@class,"ant-select")][1]`,
      `//div[contains(@class,"ant-form-item")][.//*[contains(@class,"ant-form-item-label") and contains(normalize-space(.), ${lit})]]//div[contains(@class,"ant-picker")]//input[1]`,
      `//div[contains(@class,"ant-form-item")][.//label[contains(normalize-space(.), ${lit})]]//input[not(@type="hidden")][1]`,
      `//label[contains(normalize-space(.), ${lit})]/following::input[not(@type="hidden")][1]`,
      `//label[contains(normalize-space(.), ${lit})]/following::textarea[1]`,
      `//th[contains(normalize-space(.), ${lit})]/following-sibling::td//input[not(@type="hidden")][1]`,
      `//td[contains(normalize-space(.), ${lit})]/following-sibling::td//input[not(@type="hidden")][1]`
    ];
  },

  buildLabelXPathForElement(label, element, doc) {
    doc = doc || element.ownerDocument;
    const candidates = this.buildLabelXPathCandidates(label);

    for (const xpath of candidates) {
      try {
        const result = doc.evaluate(
          xpath,
          doc,
          null,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
          null
        );
        for (let i = 0; i < result.snapshotLength; i++) {
          const node = result.snapshotItem(i);
          if (node === element || node.contains(element)) {
            return xpath;
          }
        }
      } catch (e) {
        // try next
      }
    }
    return candidates[0];
  },

  buildXPathFallback(element, doc) {
    doc = doc || element.ownerDocument;

    if (element.id && this.isStableId(element.id)) {
      return `//*[@id="${element.id}"]`;
    }

    const name = element.getAttribute('name');
    if (name) {
      const tag = element.tagName.toLowerCase();
      try {
        const sel = `${tag}[name="${this.cssEscapeAttr(name)}"]`;
        if (doc.querySelectorAll(sel).length === 1) {
          return `//${tag}[@name="${name}"]`;
        }
      } catch (e) {
        // ignore
      }
    }

    return this._buildAbsoluteXPath(element);
  },

  buildLocator(element, doc) {
    doc = doc || element.ownerDocument;
    const rawLabel = typeof WebFormDomLabel !== 'undefined'
      ? WebFormDomLabel.findLabel(element, doc)
      : null;
    const labelText = this.normalizeLabelText(rawLabel);
    const css = this.buildCssSelector(element, doc);
    const structuralXPath = this.buildXPathFallback(element, doc);

    if (labelText) {
      const labelXPath = this.buildLabelXPathForElement(labelText, element, doc);
      const unstableId = element.id && !this.isStableId(element.id);
      if (labelXPath && (unstableId || !css)) {
        return {
          primary: labelXPath,
          fallback: css || structuralXPath,
          strategy: 'label-xpath',
          labelText
        };
      }
    }

    if (css) {
      return {
        primary: css,
        fallback: structuralXPath,
        strategy: 'css',
        labelText: labelText || null
      };
    }

    return {
      primary: structuralXPath,
      fallback: null,
      strategy: 'xpath',
      labelText: labelText || null
    };
  },

  _buildAbsoluteXPath(element) {
    const parts = [];
    let current = element;

    while (current && current.nodeType === Node.ELEMENT_NODE) {
      if (current.nodeName === 'HTML') break;

      if (current.nodeName === 'TR' && current.parentElement) {
        const parent = current.parentElement;
        if (parent.nodeName === 'TBODY' && parent.parentElement && parent.parentElement.nodeName === 'TABLE') {
          const table = parent.parentElement;
          const directChildren = Array.from(table.children).filter(
            (child) => child.nodeType === Node.ELEMENT_NODE
          );
          if (directChildren.length === 1 && directChildren[0].nodeName === 'TBODY') {
            parts.unshift(this._siblingSegment(current, 'TR'));
            parts.unshift(this._siblingSegment(table, 'TABLE'));
            current = table.parentElement;
            continue;
          }
        }
      }

      parts.unshift(this._siblingSegment(current, current.nodeName));
      current = current.parentElement;
      if (current && current.nodeName === 'BODY') break;
    }

    return '/html/body/' + parts.join('/');
  },

  _siblingSegment(element, nodeName) {
    let index = 1;
    let sibling = element.previousElementSibling;
    let totalCount = 1;

    while (sibling) {
      if (sibling.nodeName === nodeName) {
        index++;
        totalCount++;
      }
      sibling = sibling.previousElementSibling;
    }

    sibling = element.nextElementSibling;
    while (sibling) {
      if (sibling.nodeName === nodeName) totalCount++;
      sibling = sibling.nextElementSibling;
    }

    const tagName = nodeName.toLowerCase();
    return totalCount > 1 ? `${tagName}[${index}]` : tagName;
  }
};
