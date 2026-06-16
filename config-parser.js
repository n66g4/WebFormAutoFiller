let detectedFields = [];
let htmlContent = '';
let originalFileUrl = null;
let isSelectMode = false;

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  setupSelectModeToggle();
});

function setupEventListeners() {
  document.getElementById('mhtmlFile').addEventListener('change', handleMhtmlFile);
  document.getElementById('parseBtn').addEventListener('click', parsePage);
  document.getElementById('generateJsonBtn').addEventListener('click', generateJson);
  document.getElementById('downloadBtn').addEventListener('click', downloadConfig);
  document.getElementById('importConfigBtn').addEventListener('click', importToExtension);
}

async function handleMhtmlFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    if (originalFileUrl) {
      URL.revokeObjectURL(originalFileUrl);
      originalFileUrl = null;
    }
    originalFileUrl = URL.createObjectURL(file);

    const text = await file.text();
    htmlContent = parseMhtml(text);

    if (htmlContent) {
      displayPreview(htmlContent);
    }

    showMessage('MHTML 文件加载成功，请点击"解析页面"继续', 'success');
  } catch (error) {
    console.error('解析 MHTML 失败:', error);
    showMessage('解析 MHTML 失败: ' + error.message, 'error');
  }
}

function decodeQuotedPrintable(text) {
  const bytes = [];
  let i = 0;

  while (i < text.length) {
    if (text[i] === '=') {
      if (i + 1 < text.length && (text[i + 1] === '\r' || text[i + 1] === '\n')) {
        i++;
        if (text[i] === '\r' && i + 1 < text.length && text[i + 1] === '\n') i++;
        i++;
        continue;
      }

      if (i + 2 < text.length) {
        const hex = text.substring(i + 1, i + 3);
        if (/^[0-9A-F]{2}$/i.test(hex)) {
          bytes.push(parseInt(hex, 16));
          i += 3;
          continue;
        }
      }

      bytes.push(text.charCodeAt(i));
      i++;
    } else {
      bytes.push(text.charCodeAt(i));
      i++;
    }
  }

  try {
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
  } catch (e) {
    return String.fromCharCode.apply(null, bytes);
  }
}

function parseMhtml(mhtmlText) {
  let boundary = null;
  const boundaryPatterns = [
    /boundary=["']?([^"'\s\r\n]+)["']?/i,
    /Content-Type:\s*multipart\/[^;]*;\s*boundary=["']?([^"'\s\r\n]+)["']?/i,
    /boundary=([^\s\r\n;]+)/i
  ];

  for (const pattern of boundaryPatterns) {
    const match = mhtmlText.match(pattern);
    if (match && match[1]) {
      boundary = match[1].trim();
      break;
    }
  }

  if (boundary) {
    const boundaryRegex = new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
    const parts = mhtmlText.split(boundaryRegex);

    for (const part of parts) {
      if (!part.match(/Content-Type:\s*text\/html/i)) continue;

      const isQuotedPrintable = part.match(/Content-Transfer-Encoding:\s*quoted-printable/i);
      const headerEnd = part.indexOf('\r\n\r\n');
      const headerEndAlt = part.indexOf('\n\n');
      const contentStart = headerEnd !== -1 ? headerEnd + 4 : (headerEndAlt !== -1 ? headerEndAlt + 2 : -1);
      if (contentStart === -1) continue;

      const nextBoundaryPattern = new RegExp(`\\r?\\n--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
      const remainingPart = part.substring(contentStart);
      const nextBoundaryMatch = remainingPart.match(nextBoundaryPattern);

      let html = nextBoundaryMatch
        ? remainingPart.substring(0, nextBoundaryMatch.index).trim()
        : remainingPart.trim();

      if (isQuotedPrintable) {
        html = decodeQuotedPrintable(html);
      }

      return html;
    }
  }

  const htmlSectionMatch = mhtmlText.match(/Content-Type:\s*text\/html[^\r\n]*(?:\r?\n[^\r\n]*)*\r?\n(?:Content-Transfer-Encoding:[^\r\n]*\r?\n)?\r?\n([\s\S]*?)(?=\r?\n------|$)/i);
  if (htmlSectionMatch) {
    const sectionStart = mhtmlText.indexOf(htmlSectionMatch[0]);
    const sectionHeader = mhtmlText.substring(sectionStart, sectionStart + 500);
    const isQuotedPrintable = sectionHeader.match(/Content-Transfer-Encoding:\s*quoted-printable/i);
    let html = htmlSectionMatch[1].trim();
    if (isQuotedPrintable) html = decodeQuotedPrintable(html);
    if (html.length > 100) return html;
  }

  const directHtmlPatterns = [
    /Content-Type:\s*text\/html[^\r\n]*\r?\n\r?\n([\s\S]*?)(?=\r?\nContent-Type:|\r?\n--|$)/i,
    /Content-Type:\s*text\/html[^\r\n]*\r?\n([\s\S]*?)(?=\r?\nContent-Type:|\r?\n--|$)/i
  ];

  for (const pattern of directHtmlPatterns) {
    const match = mhtmlText.match(pattern);
    if (match && match[1]) {
      let html = match[1].trim();
      if (html.includes('=3D') || html.includes('=0A') || html.match(/=[0-9A-F]{2}/i)) {
        html = decodeQuotedPrintable(html);
      }
      if (html.length > 100) return html;
    }
  }

  if (mhtmlText.trim().startsWith('<!DOCTYPE') || mhtmlText.trim().startsWith('<html')) {
    return mhtmlText.trim();
  }

  throw new Error('无法从 MHTML 中提取 HTML 内容。请检查文件格式是否正确。');
}

function parsePage() {
  if (!htmlContent) {
    showMessage('请先上传 MHTML 文件', 'error');
    return;
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      throw new Error('HTML 解析失败: ' + parserError.textContent);
    }

    detectedFields = [];
    displayFields([]);
    displayPreview(htmlContent);

    setTimeout(() => {
      const iframe = document.querySelector('#previewArea iframe');
      if (iframe) setupPreviewClickHandler(iframe);
    }, 500);

    document.getElementById('resultsArea').style.display = 'block';
    document.getElementById('generateJsonBtn').disabled = false;
    showMessage('页面解析成功，请在预览中点击元素添加到字段列表', 'success');
  } catch (error) {
    console.error('解析页面失败:', error);
    showMessage('解析页面失败: ' + error.message, 'error');
  }
}

function locatorsEqual(a, b) {
  const la = WebFormLocator.toLocator(a);
  const lb = WebFormLocator.toLocator(b);
  return la.primary === lb.primary && la.fallback === lb.fallback;
}

function displayFields(fields) {
  const container = document.getElementById('fieldsList');
  container.innerHTML = '';

  fields.forEach((field, index) => {
    const fieldDiv = document.createElement('div');
    fieldDiv.className = 'field-item';

    const header = document.createElement('div');
    header.className = 'field-item-header';

    const label = document.createElement('label');
    label.className = 'field-select-label';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = field.selected;
    checkbox.addEventListener('change', (e) => toggleFieldSelection(index, e.target.checked));

    const labelSpan = document.createElement('span');
    labelSpan.textContent = field.label || '未命名字段';

    label.appendChild(checkbox);
    label.appendChild(labelSpan);

    const mainDiv = document.createElement('div');
    mainDiv.className = 'field-item-main';
    mainDiv.appendChild(label);

    const metaDiv = document.createElement('div');
    metaDiv.className = 'field-item-meta';
    const typeBadge = document.createElement('span');
    typeBadge.className = 'field-type-badge';
    typeBadge.textContent = `${field.type}${field.elementType ? ` (${field.elementType})` : ''}`;
    metaDiv.appendChild(typeBadge);
    mainDiv.appendChild(metaDiv);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = '🗑️';
    deleteBtn.title = '删除';
    deleteBtn.addEventListener('click', () => removeField(index));

    const actions = document.createElement('div');
    actions.className = 'field-item-actions';
    actions.appendChild(deleteBtn);

    header.appendChild(mainDiv);
    header.appendChild(actions);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'field-item-input';
    input.placeholder = '字段名称（中文）';
    input.value = field.label;
    input.addEventListener('change', (e) => updateFieldLabel(index, e.target.value));

    fieldDiv.appendChild(header);
    fieldDiv.appendChild(input);

    if (field.preview) {
      const preview = document.createElement('div');
      preview.className = 'field-item-preview';
      preview.textContent = `预览: ${field.preview}`;
      fieldDiv.appendChild(preview);
    }

    const xpathDiv = document.createElement('div');
    xpathDiv.className = 'field-item-xpath collapsed';
    xpathDiv.textContent = WebFormLocator.locatorToString(field.xpath);
    xpathDiv.title = '点击展开/折叠 XPath';
    let xpathExpanded = false;
    xpathDiv.addEventListener('click', () => {
      xpathExpanded = !xpathExpanded;
      xpathDiv.classList.toggle('collapsed', !xpathExpanded);
    });
    fieldDiv.appendChild(xpathDiv);

    container.appendChild(fieldDiv);
  });
}

function updateFieldLabel(index, label) {
  if (detectedFields[index]) detectedFields[index].label = label;
}

function toggleFieldSelection(index, selected) {
  if (detectedFields[index]) detectedFields[index].selected = selected;
}

function ensurePreviewStyles(doc) {
  if (doc.getElementById('__highlight-style')) return;
  const style = doc.createElement('style');
  style.id = '__highlight-style';
  style.textContent = `
    .__highlight-target { outline: 2px solid #ff6b6b !important; background-color: rgba(255, 107, 107, 0.18) !important; }
    .__click-highlight { outline: 2px solid #667eea !important; background-color: rgba(102, 126, 234, 0.2) !important; }
  `;
  doc.head.appendChild(style);
}

function removeField(index) {
  detectedFields.splice(index, 1);
  displayFields(detectedFields);
}

function displayPreview(html) {
  const container = document.getElementById('previewArea');
  if (!container) return;

  container.innerHTML = '';
  const iframe = document.createElement('iframe');
  iframe.style.width = '100%';
  iframe.style.height = '500px';
  iframe.style.border = 'none';
  iframe.style.borderRadius = '4px';
  iframe.id = 'previewIframe';

  if (html) {
    iframe.srcdoc = html;
    iframe.onload = () => setupPreviewClickHandler(iframe);
  } else if (originalFileUrl) {
    iframe.src = originalFileUrl;
    iframe.onload = () => {
      try { setupPreviewClickHandler(iframe); } catch (e) { console.warn(e); }
    };
  } else {
    iframe.srcdoc = '<p style="padding:16px;">暂无预览内容</p>';
  }

  container.appendChild(iframe);
}

function setupPreviewClickHandler(iframe) {
  try {
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    if (!iframeDoc) return;

    ensurePreviewStyles(iframeDoc);

    if (!iframeDoc.getElementById('__click-style')) {
      const style = iframeDoc.createElement('style');
      style.id = '__click-style';
      style.textContent = `
        .__clickable-element { cursor: pointer !important; }
        .__clickable-element:hover { outline: 2px dashed #667eea !important; background-color: rgba(102, 126, 234, 0.1) !important; }
      `;
      iframeDoc.head.appendChild(style);
    }

    iframeDoc.querySelectorAll('*').forEach((el) => el.classList.add('__clickable-element'));
    window.currentPreviewDoc = iframeDoc;

    iframeDoc.addEventListener('click', (e) => {
      if (!isSelectMode) return;
      e.preventDefault();
      e.stopPropagation();

      const clickedElement = e.target;
      if (!clickedElement) return;

      const xpath = WebFormLocator.buildLocator(clickedElement, iframeDoc);
      const fieldIndex = findFieldByXPath(xpath);

      if (fieldIndex !== -1) {
        scrollToFieldItem(fieldIndex);
        highlightElementInPreview(clickedElement, iframeDoc);
        showMessage(`已定位到字段: ${detectedFields[fieldIndex].label}`, 'success');
      } else {
        addFieldFromElement(clickedElement, iframeDoc, xpath);
        highlightElementInPreview(clickedElement, iframeDoc);
      }
    }, true);

    updateSelectModeUI();
  } catch (e) {
    console.error('设置预览点击事件失败:', e);
  }
}

function setupSelectModeToggle() {
  const toggleBtn = document.getElementById('toggleSelectModeBtn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      isSelectMode = !isSelectMode;
      updateSelectModeUI();
    });
  }
}

function updateSelectModeUI() {
  const toggleBtn = document.getElementById('toggleSelectModeBtn');
  const hintDiv = document.getElementById('selectModeHint');

  if (toggleBtn) {
    if (isSelectMode) {
      toggleBtn.textContent = '退出选择';
      toggleBtn.style.background = '#f56565';
      if (hintDiv) hintDiv.style.display = 'block';
    } else {
      toggleBtn.textContent = '开始选择元素';
      toggleBtn.style.background = '';
      if (hintDiv) hintDiv.style.display = 'none';
    }
  }

  if (window.currentPreviewDoc) {
    let hint = window.currentPreviewDoc.getElementById('__select-mode-hint');
    if (isSelectMode) {
      if (!hint) {
        hint = window.currentPreviewDoc.createElement('div');
        hint.id = '__select-mode-hint';
        hint.style.cssText = 'position:fixed;top:10px;right:10px;background:rgba(102,126,234,0.95);color:white;padding:10px 15px;border-radius:6px;font-size:13px;z-index:999999;pointer-events:none;font-weight:600;';
        window.currentPreviewDoc.body.appendChild(hint);
      }
      hint.textContent = '选择模式：点击元素添加到字段列表';
      hint.style.display = 'block';
    } else if (hint) {
      hint.style.display = 'none';
    }
  }
}

function findFieldByXPath(xpath) {
  for (let i = 0; i < detectedFields.length; i++) {
    if (locatorsEqual(detectedFields[i].xpath, xpath)) return i;
  }
  return -1;
}

function scrollToFieldItem(index) {
  const fieldItems = document.querySelectorAll('#fieldsList .field-item');
  if (!fieldItems[index]) return;

  fieldItems.forEach((item) => item.classList.remove('__selected-field'));
  fieldItems[index].classList.add('__selected-field');
  fieldItems[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => fieldItems[index].classList.remove('__selected-field'), 3000);
}

function highlightElementInPreview(element, doc) {
  doc.querySelectorAll('.__click-highlight').forEach((el) => el.classList.remove('__click-highlight'));
  element.classList.add('__click-highlight');
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => element.classList.remove('__click-highlight'), 3000);
}

function addFieldFromElement(element, doc, xpath) {
  const tagName = element.tagName.toLowerCase();
  const typeAttr = element.getAttribute('type') || '';

  if (['script', 'style', 'meta', 'link'].includes(tagName)) {
    showMessage('无法添加此类型的元素', 'error');
    return;
  }

  if (tagName === 'input' && ['hidden', 'submit', 'button', 'reset', 'image'].includes(typeAttr)) {
    showMessage('无法添加隐藏字段或按钮', 'error');
    return;
  }

  const label = WebFormDomLabel.findLabel(element, doc)
    || WebFormDomLabel.getElementText(element)
    || element.placeholder
    || element.name
    || element.id
    || `元素 ${detectedFields.length + 1}`;

  const field = {
    xpath,
    label: label.trim(),
    name: element.name || element.id || `field_${detectedFields.length + 1}`,
    type: tagName,
    elementType: typeAttr,
    preview: WebFormDomLabel.getElementPreview(element),
    selected: ['input', 'textarea', 'select'].includes(tagName) || element.isContentEditable
  };

  detectedFields.push(field);
  displayFields(detectedFields);
  setTimeout(() => scrollToFieldItem(detectedFields.length - 1), 100);
  showMessage(`已添加字段: ${field.label}`, 'success');
}

function generateJson() {
  const configName = document.getElementById('configName').value.trim();
  const configDescription = document.getElementById('configDescription').value.trim();

  if (!configName) {
    showMessage('请填写配置名称', 'error');
    return;
  }

  const configId = WebFormFieldKey.generateConfigId(configName);
  const selectedFields = detectedFields.filter((field) => field.selected);

  if (selectedFields.length === 0) {
    showMessage('请至少选择一个元素', 'error');
    return;
  }

  const mappings = {};
  const fieldMappings = {};
  const usedKeys = new Set();

  selectedFields.forEach((field, index) => {
    let key = WebFormFieldKey.generate(field.label, index);
    const originalKey = key;
    let suffix = 1;
    while (usedKeys.has(key)) {
      key = `${originalKey}${suffix}`;
      suffix++;
    }
    usedKeys.add(key);
    mappings[key] = field.label;
    fieldMappings[field.label] = WebFormLocator.locatorToStorage(field.xpath);
  });

  const config = {
    id: configId,
    name: configName,
    description: configDescription || `用于填充${configName}相关表单`,
    mappings,
    outputFormat: 'json',
    errorHandling: {
      logErrors: true,
      errorMessage: '处理数据时发生错误'
    },
    fieldMappings
  };

  displayConfigFields(mappings, fieldMappings);

  const jsonOutput = document.getElementById('jsonOutput');
  jsonOutput.textContent = JSON.stringify(config, null, 2);
  document.getElementById('jsonOutputArea').style.display = 'block';
  document.getElementById('downloadBtn').disabled = false;
  document.getElementById('importConfigBtn').disabled = false;
  window.currentGeneratedConfig = config;

  showMessage('JSON 配置生成成功', 'success');
}

function displayConfigFields(mappings, fieldMappings) {
  const container = document.getElementById('configFieldsDisplay');
  container.innerHTML = '';

  const fieldsList = Object.entries(mappings).map(([key, label]) => ({
    key,
    label,
    xpath: WebFormLocator.locatorToString(fieldMappings[label] || '')
  }));

  if (fieldsList.length === 0) {
    container.innerHTML = '<p style="color: #718096; text-align: center; padding: 20px;">暂无字段</p>';
    return;
  }

  fieldsList.forEach((field) => {
    const row = document.createElement('div');
    row.className = 'config-field-row';

    const keyDiv = document.createElement('div');
    keyDiv.className = 'config-field-key';
    keyDiv.textContent = field.key;

    const labelDiv = document.createElement('div');
    labelDiv.className = 'config-field-label';
    labelDiv.textContent = field.label;

    const xpathDiv = document.createElement('div');
    xpathDiv.className = 'config-field-xpath';
    xpathDiv.textContent = field.xpath || '未找到 XPath';

    row.appendChild(keyDiv);
    row.appendChild(labelDiv);
    row.appendChild(xpathDiv);
    container.appendChild(row);
  });
}

async function downloadConfig() {
  if (!window.currentGeneratedConfig) {
    showMessage('请先生成 JSON 配置', 'error');
    return;
  }

  const config = window.currentGeneratedConfig;
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${config.id}.json`;
  a.click();
  URL.revokeObjectURL(url);

  showMessage('配置文件已下载', 'success');
}

async function importToExtension() {
  if (!window.currentGeneratedConfig) {
    showMessage('请先生成 JSON 配置', 'error');
    return;
  }

  try {
    await WebFormStorage.upsertConfigInIndex(window.currentGeneratedConfig);
    showMessage(`配置「${window.currentGeneratedConfig.name}」已导入扩展，可在 popup 中直接使用`, 'success');
  } catch (error) {
    console.error('导入扩展失败:', error);
    showMessage('导入扩展失败: ' + error.message, 'error');
  }
}

function showMessage(message, type = 'info') {
  const messageDiv = document.getElementById('message');
  messageDiv.className = type === 'error' ? 'error-box' : type === 'success' ? 'success-box' : 'info-box';
  messageDiv.textContent = message;
  messageDiv.style.display = 'block';

  if (type === 'success') {
    setTimeout(() => { messageDiv.style.display = 'none'; }, 3000);
  }
}
