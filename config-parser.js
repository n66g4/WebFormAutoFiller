// 全局变量
let detectedFields = [];
let htmlContent = '';
let originalFileUrl = null;
let configMeta = {
  id: '',
  name: '',
  description: ''
};
let isSelectMode = false; // 选择模式状态

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  setupSelectModeToggle();
});

// 设置事件监听
function setupEventListeners() {
  document.getElementById('mhtmlFile').addEventListener('change', handleMhtmlFile);
  document.getElementById('parseBtn').addEventListener('click', parsePage);
  document.getElementById('generateJsonBtn').addEventListener('click', generateJson);
  document.getElementById('downloadBtn').addEventListener('click', downloadConfig);
  
  // 自动生成配置 ID
}

// 根据名称生成配置 ID
function generateIdFromConfigName(name) {
  if (!name) return 'new-config';
  
  // 提取中文字符
  const chineseChars = name.match(/[\u4e00-\u9fa5]/g);
  if (chineseChars && chineseChars.length > 0) {
    // 使用前几个字符的拼音首字母
    let id = '';
    for (let i = 0; i < Math.min(chineseChars.length, 6); i++) {
      const initial = getPinyinInitial(chineseChars[i]);
      if (initial) {
        id += initial.toLowerCase();
      }
    }
    if (id.length >= 2) {
      return id;
    }
  }
  
  // 如果是英文，转换为小写并替换空格和特殊字符
  const englishId = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  
  return englishId || 'new-config';
}

// 处理 MHTML 文件
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
    console.log('MHTML 文件大小:', text.length, '字符');
    console.log('MHTML 前500字符:', text.substring(0, 500));
    
    htmlContent = parseMhtml(text);
    console.log('提取的 HTML 长度:', htmlContent.length);
    console.log('提取的 HTML 前500字符:', htmlContent.substring(0, 500));
    
    // 立即显示预览
    if (htmlContent) {
      displayPreview(htmlContent);
    }
    
    showMessage('MHTML 文件加载成功，请点击"解析页面"继续', 'success');
  } catch (error) {
    console.error('解析 MHTML 失败:', error);
    showMessage('解析 MHTML 失败: ' + error.message, 'error');
  }
}

// 解码 quoted-printable 编码
function decodeQuotedPrintable(text) {
  // 先收集所有字节
  const bytes = [];
  let i = 0;
  
  while (i < text.length) {
    if (text[i] === '=') {
      // 检查是否是软换行（行尾的 =）
      if (i + 1 < text.length && (text[i + 1] === '\r' || text[i + 1] === '\n')) {
        // 软换行，跳过 = 和换行符
        i++;
        if (text[i] === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
          i++;
        }
        i++;
        continue;
      }
      
      // 检查是否是编码字符 =XX
      if (i + 2 < text.length) {
        const hex = text.substring(i + 1, i + 3);
        if (/^[0-9A-F]{2}$/i.test(hex)) {
          bytes.push(parseInt(hex, 16));
          i += 3;
          continue;
        }
      }
      
      // 如果不是编码字符，保留原字符
      bytes.push(text.charCodeAt(i));
      i++;
    } else {
      bytes.push(text.charCodeAt(i));
      i++;
    }
  }
  
  // 将字节数组转换为 UTF-8 字符串
  try {
    const uint8Array = new Uint8Array(bytes);
    return new TextDecoder('utf-8').decode(uint8Array);
  } catch (e) {
    // 如果 TextDecoder 不可用，使用 fallback 方法
    return String.fromCharCode.apply(null, bytes);
  }
}

// 解析 MHTML 内容
function parseMhtml(mhtmlText) {
  console.log('开始解析 MHTML...');
  
  // 方法1: 尝试查找 boundary
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
      console.log('找到 boundary:', boundary);
      break;
    }
  }

  if (boundary) {
    // 使用 boundary 分割
    const boundaryRegex = new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
    const parts = mhtmlText.split(boundaryRegex);
    console.log('分割后的部分数量:', parts.length);
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part.match(/Content-Type:\s*text\/html/i)) {
        console.log(`在第 ${i} 部分找到 HTML 内容`);
        
        // 检查编码方式
        const isQuotedPrintable = part.match(/Content-Transfer-Encoding:\s*quoted-printable/i);
        console.log('是否使用 quoted-printable 编码:', !!isQuotedPrintable);
        
        // 查找 HTML 内容（跳过头部）
        // 先找到头部结束的位置（两个连续换行）
        const headerEnd = part.indexOf('\r\n\r\n');
        const headerEndAlt = part.indexOf('\n\n');
        const contentStart = headerEnd !== -1 ? headerEnd + 4 : (headerEndAlt !== -1 ? headerEndAlt + 2 : -1);
        
        if (contentStart === -1) {
          console.log('未找到头部结束位置');
          continue;
        }
        
        // 找到下一个 boundary 的位置（如果存在）
        const nextBoundaryPattern = new RegExp(`\\r?\\n--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
        const remainingPart = part.substring(contentStart);
        const nextBoundaryMatch = remainingPart.match(nextBoundaryPattern);
        
        let html;
        if (nextBoundaryMatch) {
          // 提取到下一个 boundary 之前的内容
          html = remainingPart.substring(0, nextBoundaryMatch.index).trim();
        } else {
          // 如果没有下一个 boundary，提取到 part 的末尾
          html = remainingPart.trim();
        }
        
        // 如果是 quoted-printable 编码，需要解码
        if (isQuotedPrintable) {
          console.log('解码 quoted-printable 编码...');
          html = decodeQuotedPrintable(html);
        }
        
        console.log('提取的 HTML 长度:', html.length);
        console.log('HTML 前200字符:', html.substring(0, 200));
        console.log('HTML 后200字符:', html.substring(Math.max(0, html.length - 200)));
        
        // 验证 HTML 是否完整
        if (html.includes('</html>') || html.includes('</body>')) {
          console.log('HTML 内容看起来是完整的');
        } else {
          console.warn('警告: HTML 内容可能不完整');
        }
        
        return html;
      }
    }
  }

  // 方法2: 直接查找 HTML 内容（无 boundary）
  console.log('尝试直接查找 HTML 内容...');
  
  // 先查找 HTML 部分及其编码信息
  const htmlSectionMatch = mhtmlText.match(/Content-Type:\s*text\/html[^\r\n]*(?:\r?\n[^\r\n]*)*\r?\n(?:Content-Transfer-Encoding:[^\r\n]*\r?\n)?\r?\n([\s\S]*?)(?=\r?\n------|$)/i);
  if (htmlSectionMatch) {
    // 检查这部分是否使用 quoted-printable
    const sectionStart = mhtmlText.indexOf(htmlSectionMatch[0]);
    const sectionHeader = mhtmlText.substring(sectionStart, sectionStart + 500);
    const isQuotedPrintable = sectionHeader.match(/Content-Transfer-Encoding:\s*quoted-printable/i);
    
    let html = htmlSectionMatch[1].trim();
    
    if (isQuotedPrintable) {
      console.log('检测到 quoted-printable 编码，进行解码...');
      html = decodeQuotedPrintable(html);
    }
    
    if (html.length > 100) {
      console.log('直接提取 HTML 成功，长度:', html.length);
      return html;
    }
  }
  
  // 备用方法：直接查找 HTML 标签
  const directHtmlPatterns = [
    /Content-Type:\s*text\/html[^\r\n]*\r?\n\r?\n([\s\S]*?)(?=\r?\nContent-Type:|\r?\n--|$)/i,
    /Content-Type:\s*text\/html[^\r\n]*\r?\n([\s\S]*?)(?=\r?\nContent-Type:|\r?\n--|$)/i
  ];
  
  for (const pattern of directHtmlPatterns) {
    const match = mhtmlText.match(pattern);
    if (match && match[1]) {
      let html = match[1].trim();
      
      // 检查是否需要解码 quoted-printable（通过内容特征判断）
      if (html.includes('=3D') || html.includes('=0A') || html.match(/=[0-9A-F]{2}/i)) {
        console.log('检测到 quoted-printable 编码特征，进行解码...');
        html = decodeQuotedPrintable(html);
      }
      
      if (html.length > 100) {
        console.log('直接提取 HTML 成功，长度:', html.length);
        return html;
      }
    }
  }

  // 方法3: 如果文件本身就是 HTML（可能用户上传错了）
  if (mhtmlText.trim().startsWith('<!DOCTYPE') || mhtmlText.trim().startsWith('<html')) {
    console.log('文件本身就是 HTML 格式');
    return mhtmlText.trim();
  }

  throw new Error('无法从 MHTML 中提取 HTML 内容。请检查文件格式是否正确。');
}

// 解析页面
function parsePage() {
  if (!htmlContent) {
    showMessage('请先上传 MHTML 文件或解析当前页面', 'error');
    return;
  }

  try {
    console.log('开始解析 HTML，内容长度:', htmlContent.length);
    
    // 创建临时 DOM 解析器
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');

    // 检查解析错误
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      console.error('HTML 解析错误:', parserError.textContent);
      throw new Error('HTML 解析失败: ' + parserError.textContent);
    }

    console.log('HTML 解析成功');
    console.log('文档中的 input 元素数量:', doc.querySelectorAll('input').length);
    console.log('文档中的 textarea 元素数量:', doc.querySelectorAll('textarea').length);
    console.log('文档中的 select 元素数量:', doc.querySelectorAll('select').length);

    // 清空已检测的字段列表
    detectedFields = [];
    displayFields([]);

    // 只显示预览，不自动检测字段
    displayPreview(htmlContent);
    
    // 确保预览加载后设置点击事件（延迟一下确保 iframe 已加载）
    setTimeout(() => {
      const iframe = document.querySelector('#previewArea iframe');
      if (iframe) {
        setupPreviewClickHandler(iframe);
      }
    }, 500);

    document.getElementById('resultsArea').style.display = 'block';
    document.getElementById('generateJsonBtn').disabled = false;

    showMessage('页面解析成功，请在预览中点击元素添加到字段列表', 'success');
  } catch (error) {
    console.error('解析页面失败:', error);
    showMessage('解析页面失败: ' + error.message, 'error');
  }
}

// 检测表单字段
function detectFormFields(doc) {
  const fields = [];
  const candidateSelectors = 'input, textarea, select, button, a, label, span, div, p, td, th, li';
  const elements = doc.querySelectorAll(candidateSelectors);

  elements.forEach((element, index) => {
    const tagName = element.tagName.toLowerCase();
    const typeAttr = element.getAttribute('type') || '';

    // 忽略脚本/样式等
    if (['script', 'style', 'meta', 'link'].includes(tagName)) {
      return;
    }

    // 对 input 过滤隐藏和按钮
    if (tagName === 'input' && ['hidden', 'submit', 'button', 'reset', 'image'].includes(typeAttr)) {
      return;
    }

    const xpath = getXPath(element);
    const label = findLabel(element, doc) || getElementText(element) || element.placeholder || element.name || element.id || `元素 ${index + 1}`;
    const preview = getElementPreview(element);
    const isFormField = ['input', 'textarea', 'select'].includes(tagName) || element.isContentEditable;

    fields.push({
      xpath,
      label: label.trim(),
      name: element.name || element.id || `field_${index + 1}`,
      type: tagName,
      elementType: typeAttr,
      preview,
      selected: isFormField,
      originalElement: element
    });
  });

  return fields;
}

// 获取元素的 XPath（绝对路径）
function getXPath(element) {
  // 优先使用 ID（如果唯一）
  if (element.id) {
    // 检查 ID 是否唯一
    const sameIdElements = element.ownerDocument.querySelectorAll(`#${CSS.escape(element.id)}`);
    if (sameIdElements.length === 1) {
      return `//*[@id="${element.id}"]`;
    }
  }

  const parts = [];
  let current = element;

  // 从当前元素向上遍历到 body
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    // 如果到达 html，停止
    if (current.nodeName === 'HTML') {
      break;
    }

    // 处理 table -> tbody -> tr 的情况
    // 如果当前元素是 tr，且父元素是 tbody，且 tbody 的父元素是 table
    // 需要检查 tbody 是否是浏览器自动插入的
    if (current.nodeName === 'TR' && current.parentElement) {
      const parent = current.parentElement;
      if (parent.nodeName === 'TBODY' && parent.parentElement && parent.parentElement.nodeName === 'TABLE') {
        // 检查 tbody 是否是唯一的直接子元素
        const table = parent.parentElement;
        const directChildren = Array.from(table.children).filter(child => 
          child.nodeType === Node.ELEMENT_NODE
        );
        // 如果 table 只有一个 tbody 子元素，可以跳过 tbody
        if (directChildren.length === 1 && directChildren[0].nodeName === 'TBODY') {
          // 计算 tr 在同级 tr 中的索引和总数
          let trIndex = 1;
          let trSibling = current.previousElementSibling;
          let trTotalCount = 1;
          while (trSibling) {
            if (trSibling.nodeName === 'TR') {
              trIndex++;
              trTotalCount++;
            }
            trSibling = trSibling.previousElementSibling;
          }
          trSibling = current.nextElementSibling;
          while (trSibling) {
            if (trSibling.nodeName === 'TR') {
              trTotalCount++;
            }
            trSibling = trSibling.nextElementSibling;
          }
          if (trTotalCount > 1) {
            parts.unshift(`tr[${trIndex}]`);
          } else {
            parts.unshift('tr');
          }
          
          // 计算 table 在同级 table 中的索引和总数
          let tableIndex = 1;
          let tableSibling = table.previousElementSibling;
          let tableTotalCount = 1;
          while (tableSibling) {
            if (tableSibling.nodeName === 'TABLE') {
              tableIndex++;
              tableTotalCount++;
            }
            tableSibling = tableSibling.previousElementSibling;
          }
          tableSibling = table.nextElementSibling;
          while (tableSibling) {
            if (tableSibling.nodeName === 'TABLE') {
              tableTotalCount++;
            }
            tableSibling = tableSibling.nextElementSibling;
          }
          if (tableTotalCount > 1) {
            parts.unshift(`table[${tableIndex}]`);
          } else {
            parts.unshift('table');
          }
          
          // 跳过 tbody 和 tr，继续向上遍历
          current = table.parentElement;
          continue;
        }
      }
    }

    let index = 1;
    let sibling = current.previousElementSibling;
    let totalCount = 1; // 包括当前元素

    // 计算同类型兄弟元素的索引和总数
    while (sibling) {
      if (sibling.nodeName === current.nodeName) {
        index++;
        totalCount++;
      }
      sibling = sibling.previousElementSibling;
    }
    
    // 检查后面是否还有同类型元素
    sibling = current.nextElementSibling;
    while (sibling) {
      if (sibling.nodeName === current.nodeName) {
        totalCount++;
      }
      sibling = sibling.nextElementSibling;
    }

    const tagName = current.nodeName.toLowerCase();
    // 只有当有多个同类型元素时才添加索引
    if (totalCount > 1) {
      parts.unshift(`${tagName}[${index}]`);
    } else {
      parts.unshift(tagName);
    }

    current = current.parentElement;
    
    // 如果到达 body，停止
    if (current && current.nodeName === 'BODY') {
      break;
    }
  }

  // 确保以 /html/body/ 开头
  return '/html/body/' + parts.join('/');
}

// 查找字段标签
function findLabel(input, doc) {
  // 方法1: 通过 for 属性查找
  if (input.id) {
    const label = doc.querySelector(`label[for="${CSS.escape(input.id)}"]`);
    if (label) {
      const text = label.textContent.trim();
      if (text) return text;
    }
  }

  // 方法2: 查找父元素中的 label（最近的）
  let parent = input.parentElement;
  while (parent && parent !== doc.body && parent !== doc.documentElement) {
    const label = parent.querySelector('label');
    if (label && label !== input) {
      const text = label.textContent.trim();
      if (text) return text;
    }
    parent = parent.parentElement;
  }

  // 方法3: 查找前面的 label 元素
  let prev = input.previousElementSibling;
  while (prev) {
    if (prev.tagName === 'LABEL') {
      const text = prev.textContent.trim();
      if (text) return text;
    }
    // 检查前面的元素中是否有 label
    const labelInPrev = prev.querySelector('label');
    if (labelInPrev) {
      const text = labelInPrev.textContent.trim();
      if (text) return text;
    }
    prev = prev.previousElementSibling;
  }

  // 方法4: 查找周围的文本节点（td, th, div 等中的文本）
  parent = input.parentElement;
  if (parent) {
    // 查找父元素中的文本内容（可能是 th 或 td）
    const textNodes = Array.from(parent.childNodes)
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent.trim())
      .filter(text => text.length > 0);
    
    if (textNodes.length > 0) {
      return textNodes[0];
    }

    // 查找父元素的兄弟元素（可能是表头）
    const prevSibling = parent.previousElementSibling;
    if (prevSibling) {
      const text = prevSibling.textContent.trim();
      if (text && text.length < 50) return text; // 避免返回过长的文本
    }
  }

  return null;
}

// 获取元素文本
function getElementText(element) {
  if (!element) return '';
  const text = element.innerText || element.textContent || '';
  return text.trim().replace(/\s+/g, ' ');
}

function getElementPreview(element) {
  const text = getElementText(element);
  if (text) return text.substring(0, 60);
  if (element.placeholder) return element.placeholder;
  if (element.value) return element.value;
  return '';
}

// 显示检测到的字段
function displayFields(fields) {
  const container = document.getElementById('fieldsList');
  container.innerHTML = '';

  fields.forEach((field, index) => {
    const fieldDiv = document.createElement('div');
    fieldDiv.className = 'field-item';
    fieldDiv.dataset.fieldIndex = index;
    
    // 创建字段项结构
    const header = document.createElement('div');
    header.className = 'field-item-header';
    
    const label = document.createElement('label');
    label.className = 'field-select-label';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = field.selected;
    checkbox.addEventListener('change', (e) => {
      toggleFieldSelection(index, e.target.checked);
    });
    
    const labelSpan = document.createElement('span');
    labelSpan.textContent = field.label || '未命名字段';
    
    label.appendChild(checkbox);
    label.appendChild(labelSpan);
    
    const mainDiv = document.createElement('div');
    mainDiv.className = 'field-item-main';
    mainDiv.appendChild(label);
    
    // 字段元信息（类型标签）
    const metaDiv = document.createElement('div');
    metaDiv.className = 'field-item-meta';
    
    const typeBadge = document.createElement('span');
    typeBadge.className = 'field-type-badge';
    typeBadge.textContent = `${field.type}${field.elementType ? ` (${field.elementType})` : ''}`;
    metaDiv.appendChild(typeBadge);
    
    mainDiv.appendChild(metaDiv);
    
    const actions = document.createElement('div');
    actions.className = 'field-item-actions';
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = '🗑️';
    deleteBtn.title = '删除';
    deleteBtn.addEventListener('click', () => {
      removeField(index);
    });
    
    actions.appendChild(deleteBtn);
    
    header.appendChild(mainDiv);
    header.appendChild(actions);
    
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'field-item-input';
    input.placeholder = '字段名称（中文）';
    input.value = field.label;
    input.addEventListener('change', (e) => {
      updateFieldLabel(index, e.target.value);
    });
    
    fieldDiv.appendChild(header);
    fieldDiv.appendChild(input);
    
    if (field.preview) {
      const preview = document.createElement('div');
      preview.className = 'field-item-preview';
      preview.textContent = `预览: ${field.preview}`;
      fieldDiv.appendChild(preview);
    }
    
    // XPath 可折叠显示
    const xpathDiv = document.createElement('div');
    xpathDiv.className = 'field-item-xpath collapsed';
    xpathDiv.textContent = field.xpath;
    xpathDiv.title = '点击展开/折叠 XPath';
    let xpathExpanded = false;
    xpathDiv.addEventListener('click', () => {
      xpathExpanded = !xpathExpanded;
      if (xpathExpanded) {
        xpathDiv.classList.remove('collapsed');
      } else {
        xpathDiv.classList.add('collapsed');
      }
    });
    fieldDiv.appendChild(xpathDiv);
    
    container.appendChild(fieldDiv);
  });
}

// 更新字段标签
function updateFieldLabel(index, label) {
  if (detectedFields[index]) {
    detectedFields[index].label = label;
  }
}

function toggleFieldSelection(index, selected) {
  if (detectedFields[index]) {
    detectedFields[index].selected = selected;
  }
}

function removeHighlights(doc) {
  const iframe = doc ? null : document.querySelector('#previewArea iframe');
  const targetDoc = doc || (iframe && (iframe.contentDocument || iframe.contentWindow.document));
  if (!targetDoc) return;

  targetDoc.querySelectorAll('.__highlight-target').forEach(node => {
    node.classList.remove('__highlight-target');
  });
}

function ensurePreviewStyles(doc) {
  if (doc.getElementById('__highlight-style')) return;
  const style = doc.createElement('style');
  style.id = '__highlight-style';
  style.textContent = `
    .__highlight-target {
      outline: 2px solid #ff6b6b !important;
      background-color: rgba(255, 107, 107, 0.18) !important;
      transition: outline 0.2s ease-in-out;
    }
  `;
  doc.head.appendChild(style);
}

// 删除字段
function removeField(index) {
  detectedFields.splice(index, 1);
  displayFields(detectedFields);
}

// 显示预览
function displayPreview(html) {
  const container = document.getElementById('previewArea');
  if (!container) {
    console.error('预览容器不存在');
    return;
  }

  // 清空容器
  container.innerHTML = '';
  
  const iframe = document.createElement('iframe');
  iframe.style.width = '100%';
  iframe.style.height = '500px';
  iframe.style.border = 'none';
  iframe.style.borderRadius = '4px';
  iframe.id = 'previewIframe';

  // 优先使用传入的解析后的 HTML
  if (html) {
    console.log('使用解析后的 HTML 显示预览，长度:', html.length);
    iframe.srcdoc = html;
    iframe.onload = () => {
      console.log('解析后的 HTML 预览加载完成');
      // 注入点击事件监听器
      setupPreviewClickHandler(iframe);
    };
    iframe.onerror = (e) => {
      console.error('预览加载失败:', e);
      showMessage('预览加载失败，请检查 HTML 内容', 'error');
    };
  } else if (originalFileUrl) {
    console.log('使用原始 MHTML 文件显示预览');
    iframe.src = originalFileUrl;
    iframe.onload = () => {
      console.log('原始 MHTML 预览加载完成');
      // 尝试注入点击事件监听器（可能因为跨域失败）
      try {
        setupPreviewClickHandler(iframe);
      } catch (e) {
        console.warn('无法注入点击事件监听器（可能是跨域问题）:', e);
      }
    };
    iframe.onerror = (e) => {
      console.error('原始文件预览加载失败:', e);
      showMessage('原始文件预览加载失败', 'error');
    };
  } else {
    iframe.srcdoc = '<p style="padding:16px;">暂无预览内容</p>';
  }

  container.appendChild(iframe);
}

// 设置预览页面的点击事件处理
function setupPreviewClickHandler(iframe) {
  try {
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    if (!iframeDoc) {
      console.warn('无法访问 iframe 文档');
      return;
    }

    // 确保样式已添加
    ensurePreviewStyles(iframeDoc);
    
    // 添加点击样式
    if (!iframeDoc.getElementById('__click-style')) {
      const style = iframeDoc.createElement('style');
      style.id = '__click-style';
      style.textContent = `
        .__clickable-element {
          cursor: pointer !important;
          position: relative !important;
        }
        .__clickable-element:hover {
          outline: 2px dashed #667eea !important;
          background-color: rgba(102, 126, 234, 0.1) !important;
        }
      `;
      iframeDoc.head.appendChild(style);
    }

    // 为所有可点击元素添加鼠标样式
    const allElements = iframeDoc.querySelectorAll('*');
    allElements.forEach(el => {
      el.classList.add('__clickable-element');
    });

    // 添加点击事件监听器
    // 使用捕获阶段，但只在按住 Ctrl 或 Cmd 键时激活（避免干扰正常交互）
    let clickHandler = null;
    
    // 存储 iframe 文档引用，供选择模式切换使用
    window.currentPreviewDoc = iframeDoc;
    
    clickHandler = (e) => {
      // 只在选择模式下处理点击
      if (!isSelectMode) {
        return;
      }
      
      e.preventDefault();
      e.stopPropagation();
      
      const clickedElement = e.target;
      if (!clickedElement) return;

      // 获取点击元素的 XPath
      const xpath = getXPathFromElement(clickedElement, iframeDoc);
      console.log('点击的元素 XPath:', xpath);

      // 在字段列表中查找匹配的字段
      const fieldIndex = findFieldByXPath(xpath);
      if (fieldIndex !== -1) {
        // 如果已存在，滚动到对应的字段项并高亮
        scrollToFieldItem(fieldIndex);
        highlightElementInPreview(clickedElement, iframeDoc);
        showMessage(`已定位到字段: ${detectedFields[fieldIndex].label}`, 'success');
      } else {
        // 如果不存在，添加到字段列表
        addFieldFromElement(clickedElement, iframeDoc, xpath);
        highlightElementInPreview(clickedElement, iframeDoc);
      }
    };
    
    iframeDoc.addEventListener('click', clickHandler, true); // 使用捕获阶段确保能捕获所有点击

    // 更新选择模式状态
    updateSelectModeUI();
    
    console.log('预览点击事件监听器已设置');
  } catch (e) {
    console.error('设置预览点击事件失败:', e);
  }
}

// 设置选择模式切换
function setupSelectModeToggle() {
  const toggleBtn = document.getElementById('toggleSelectModeBtn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      isSelectMode = !isSelectMode;
      updateSelectModeUI();
    });
  }
}

// 更新选择模式UI
function updateSelectModeUI() {
  const toggleBtn = document.getElementById('toggleSelectModeBtn');
  const hintDiv = document.getElementById('selectModeHint');
  
  if (toggleBtn) {
    if (isSelectMode) {
      toggleBtn.textContent = '退出选择';
      toggleBtn.style.background = '#f56565';
      if (hintDiv) {
        hintDiv.style.display = 'block';
      }
    } else {
      toggleBtn.textContent = '开始选择元素';
      toggleBtn.style.background = '';
      if (hintDiv) {
        hintDiv.style.display = 'none';
      }
    }
  }
  
  // 更新预览中的提示
  if (window.currentPreviewDoc) {
    let hintDiv = window.currentPreviewDoc.getElementById('__select-mode-hint');
    if (isSelectMode) {
      if (!hintDiv) {
        hintDiv = window.currentPreviewDoc.createElement('div');
        hintDiv.id = '__select-mode-hint';
        hintDiv.style.cssText = `
          position: fixed;
          top: 10px;
          right: 10px;
          background: rgba(102, 126, 234, 0.95);
          color: white;
          padding: 10px 15px;
          border-radius: 6px;
          font-size: 13px;
          z-index: 999999;
          pointer-events: none;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          font-weight: 600;
        `;
        window.currentPreviewDoc.body.appendChild(hintDiv);
      }
      hintDiv.textContent = '🎯 选择模式：直接点击元素添加到字段列表';
      hintDiv.style.display = 'block';
    } else {
      if (hintDiv) {
        hintDiv.style.display = 'none';
      }
    }
  }
}

// 从元素获取 XPath（在 iframe 中）- 使用与 getXPath 相同的逻辑
function getXPathFromElement(element, doc) {
  // 优先使用 ID（如果唯一）
  if (element.id) {
    try {
      const sameIdElements = doc.querySelectorAll(`#${CSS.escape(element.id)}`);
      if (sameIdElements.length === 1) {
        return `//*[@id="${element.id}"]`;
      }
    } catch (e) {
      // 如果 CSS.escape 不可用，使用简单方法
      const sameIdElements = doc.querySelectorAll(`[id="${element.id}"]`);
      if (sameIdElements.length === 1) {
        return `//*[@id="${element.id}"]`;
      }
    }
  }

  const parts = [];
  let current = element;

  // 从当前元素向上遍历到 body
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    // 如果到达 html，停止
    if (current.nodeName === 'HTML') {
      break;
    }

    // 处理 table -> tbody -> tr 的情况
    // 如果当前元素是 tr，且父元素是 tbody，且 tbody 的父元素是 table
    // 需要检查 tbody 是否是浏览器自动插入的
    if (current.nodeName === 'TR' && current.parentElement) {
      const parent = current.parentElement;
      if (parent.nodeName === 'TBODY' && parent.parentElement && parent.parentElement.nodeName === 'TABLE') {
        // 检查 tbody 是否是唯一的直接子元素
        const table = parent.parentElement;
        const directChildren = Array.from(table.children).filter(child => 
          child.nodeType === Node.ELEMENT_NODE
        );
        // 如果 table 只有一个 tbody 子元素，可以跳过 tbody
        if (directChildren.length === 1 && directChildren[0].nodeName === 'TBODY') {
          // 计算 tr 在同级 tr 中的索引和总数
          let trIndex = 1;
          let trSibling = current.previousElementSibling;
          let trTotalCount = 1;
          while (trSibling) {
            if (trSibling.nodeName === 'TR') {
              trIndex++;
              trTotalCount++;
            }
            trSibling = trSibling.previousElementSibling;
          }
          trSibling = current.nextElementSibling;
          while (trSibling) {
            if (trSibling.nodeName === 'TR') {
              trTotalCount++;
            }
            trSibling = trSibling.nextElementSibling;
          }
          if (trTotalCount > 1) {
            parts.unshift(`tr[${trIndex}]`);
          } else {
            parts.unshift('tr');
          }
          
          // 计算 table 在同级 table 中的索引和总数
          let tableIndex = 1;
          let tableSibling = table.previousElementSibling;
          let tableTotalCount = 1;
          while (tableSibling) {
            if (tableSibling.nodeName === 'TABLE') {
              tableIndex++;
              tableTotalCount++;
            }
            tableSibling = tableSibling.previousElementSibling;
          }
          tableSibling = table.nextElementSibling;
          while (tableSibling) {
            if (tableSibling.nodeName === 'TABLE') {
              tableTotalCount++;
            }
            tableSibling = tableSibling.nextElementSibling;
          }
          if (tableTotalCount > 1) {
            parts.unshift(`table[${tableIndex}]`);
          } else {
            parts.unshift('table');
          }
          
          // 跳过 tbody 和 tr，继续向上遍历
          current = table.parentElement;
          continue;
        }
      }
    }

    let index = 1;
    let sibling = current.previousElementSibling;
    let totalCount = 1; // 包括当前元素

    // 计算同类型兄弟元素的索引和总数
    while (sibling) {
      if (sibling.nodeName === current.nodeName) {
        index++;
        totalCount++;
      }
      sibling = sibling.previousElementSibling;
    }
    
    // 检查后面是否还有同类型元素
    sibling = current.nextElementSibling;
    while (sibling) {
      if (sibling.nodeName === current.nodeName) {
        totalCount++;
      }
      sibling = sibling.nextElementSibling;
    }

    const tagName = current.nodeName.toLowerCase();
    // 只有当有多个同类型元素时才添加索引（与 getXPath 保持一致）
    if (totalCount > 1) {
      parts.unshift(`${tagName}[${index}]`);
    } else {
      parts.unshift(tagName);
    }

    current = current.parentElement;
    
    // 如果到达 body，停止
    if (current && current.nodeName === 'BODY') {
      break;
    }
  }

  return '/html/body/' + parts.join('/');
}

// 根据 XPath 查找字段索引
function findFieldByXPath(xpath) {
  // 只使用精确匹配，避免误判
  // 因为不同的元素可能有相似的最后几段路径（如 div/div/input）
  for (let i = 0; i < detectedFields.length; i++) {
    if (detectedFields[i].xpath === xpath) {
      return i;
    }
  }

  return -1;
}

// 滚动到字段项并高亮
function scrollToFieldItem(index) {
  const container = document.getElementById('fieldsList');
  if (!container) return;

  const fieldItems = container.querySelectorAll('.field-item');
  if (fieldItems[index]) {
    // 移除之前的高亮
    fieldItems.forEach(item => {
      item.classList.remove('__selected-field');
    });

    // 添加高亮
    fieldItems[index].classList.add('__selected-field');
    
    // 滚动到该项
    fieldItems[index].scrollIntoView({ behavior: 'smooth', block: 'center' });

    // 3秒后移除高亮
    setTimeout(() => {
      fieldItems[index].classList.remove('__selected-field');
    }, 3000);
  }
}

// 在预览中高亮元素
function highlightElementInPreview(element, doc) {
  // 移除之前的高亮
  doc.querySelectorAll('.__click-highlight').forEach(el => {
    el.classList.remove('__click-highlight');
  });

  // 添加高亮
  element.classList.add('__click-highlight');

  // 滚动到元素
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // 3秒后移除高亮
  setTimeout(() => {
    element.classList.remove('__click-highlight');
  }, 3000);
}

// 从点击的元素创建字段并添加到列表
function addFieldFromElement(element, doc, xpath) {
  const tagName = element.tagName.toLowerCase();
  const typeAttr = element.getAttribute('type') || '';
  
  // 忽略脚本/样式等
  if (['script', 'style', 'meta', 'link'].includes(tagName)) {
    showMessage('无法添加此类型的元素', 'error');
    return;
  }

  // 对 input 过滤隐藏和按钮
  if (tagName === 'input' && ['hidden', 'submit', 'button', 'reset', 'image'].includes(typeAttr)) {
    showMessage('无法添加隐藏字段或按钮', 'error');
    return;
  }

  // 获取标签和预览信息
  const label = findLabelInIframe(element, doc) || getElementTextInIframe(element) || element.placeholder || element.name || element.id || `元素 ${detectedFields.length + 1}`;
  const preview = getElementPreviewInIframe(element);
  const isFormField = ['input', 'textarea', 'select'].includes(tagName) || element.isContentEditable;

  // 创建字段对象
  const field = {
    xpath,
    label: label.trim(),
    name: element.name || element.id || `field_${detectedFields.length + 1}`,
    type: tagName,
    elementType: typeAttr,
    preview,
    selected: isFormField,
    originalElement: null // iframe 中的元素无法直接保存
  };

  // 添加到列表
  detectedFields.push(field);
  
  // 更新显示
  displayFields(detectedFields);
  
  // 滚动到新添加的字段
  setTimeout(() => {
    scrollToFieldItem(detectedFields.length - 1);
  }, 100);

  showMessage(`已添加字段: ${field.label}`, 'success');
}

// 在 iframe 中查找标签（简化版 findLabel）
function findLabelInIframe(input, doc) {
  // 方法1: 查找 for 属性匹配的 label
  if (input.id) {
    const label = doc.querySelector(`label[for="${input.id}"]`);
    if (label) {
      const text = label.textContent.trim();
      if (text) return text;
    }
  }

  // 方法2: 查找父元素中的 label
  let parent = input.parentElement;
  while (parent && parent !== doc.body) {
    const label = parent.querySelector('label');
    if (label) {
      const text = label.textContent.trim();
      if (text) return text;
    }
    parent = parent.parentElement;
  }

  // 方法3: 查找前面的 label 元素
  let prev = input.previousElementSibling;
  while (prev) {
    if (prev.tagName === 'LABEL') {
      const text = prev.textContent.trim();
      if (text) return text;
    }
    prev = prev.previousElementSibling;
  }

  // 方法4: 查找父元素的文本内容
  parent = input.parentElement;
  if (parent) {
    const textNodes = Array.from(parent.childNodes)
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent.trim())
      .filter(text => text.length > 0);
    
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
}

// 在 iframe 中获取元素文本
function getElementTextInIframe(element) {
  if (!element) return '';
  const text = element.innerText || element.textContent || '';
  return text.trim().replace(/\s+/g, ' ');
}

// 在 iframe 中获取元素预览
function getElementPreviewInIframe(element) {
  const text = getElementTextInIframe(element);
  if (text) return text.substring(0, 60);
  if (element.placeholder) return element.placeholder;
  if (element.value) return element.value;
  return '';
}

// 生成 JSON 配置
function generateJson() {
  const configName = document.getElementById('configName').value.trim();
  const configDescription = document.getElementById('configDescription').value.trim();

  if (!configName) {
    showMessage('请填写配置名称', 'error');
    return;
  }

  // 根据配置名称自动生成 ID
  const configId = generateIdFromConfigName(configName);

  const selectedFields = detectedFields.filter(field => field.selected);

  if (selectedFields.length === 0) {
    showMessage('请至少选择一个元素', 'error');
    return;
  }

  // 生成 mappings（字段名 -> 中文名）
  const mappings = {};
  const fieldMappings = {};
  const usedKeys = new Set(); // 跟踪已使用的键名

  selectedFields.forEach((field, index) => {
    // 生成简短的字段键名，确保唯一性
    let key = generateFieldKey(field.label, index);
    let originalKey = key;
    let suffix = 1;
    
    // 如果键名已存在，添加数字后缀直到唯一
    while (usedKeys.has(key)) {
      key = `${originalKey}${suffix}`;
      suffix++;
    }
    
    usedKeys.add(key);
    mappings[key] = field.label;
    fieldMappings[field.label] = field.xpath;
  });

  // 构建配置对象
  const config = {
    id: configId,
    name: configName,
    description: configDescription || `用于填充${configName}相关表单`,
    mappings: mappings,
    outputFormat: "json",
    errorHandling: {
      logErrors: true,
      errorMessage: "处理数据时发生错误"
    },
    fieldMappings: fieldMappings
  };

  // 显示字段映射
  displayConfigFields(mappings, fieldMappings);
  
  // 显示 JSON
  const jsonOutput = document.getElementById('jsonOutput');
  jsonOutput.textContent = JSON.stringify(config, null, 2);
  document.getElementById('jsonOutputArea').style.display = 'block';
  document.getElementById('downloadBtn').disabled = false;
  
  // 保存当前配置对象供后续使用
  window.currentGeneratedConfig = config;

  showMessage('JSON 配置生成成功', 'success');
}

// 显示配置字段映射
function displayConfigFields(mappings, fieldMappings) {
  const container = document.getElementById('configFieldsDisplay');
  container.innerHTML = '';

  // 创建表格样式的展示
  const fieldsList = Object.entries(mappings).map(([key, label]) => ({
    key,
    label,
    xpath: fieldMappings[label] || ''
  }));

  if (fieldsList.length === 0) {
    container.innerHTML = '<p style="color: #718096; text-align: center; padding: 20px;">暂无字段</p>';
    return;
  }

  fieldsList.forEach((field, index) => {
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

// 生成字段键名
function generateFieldKey(label, index) {
  if (!label) return `FIELD${index + 1}`;

  // 提取中文首字母或使用拼音简写
  const chineseChars = label.match(/[\u4e00-\u9fa5]/g);
  if (chineseChars && chineseChars.length > 0) {
    // 优先使用更多字符来生成更唯一的键名（最多6个字符）
    let key = '';
    const maxChars = Math.min(chineseChars.length, 6);
    for (let i = 0; i < maxChars; i++) {
      const initial = getPinyinInitial(chineseChars[i]);
      if (initial) {
        key += initial;
      }
    }
    
    // 如果生成了键名，返回（至少2个字符）
    if (key.length >= 2) {
      return key.toUpperCase();
    }
    
    // 如果不够，尝试使用所有字符
    if (chineseChars.length > 6) {
      key = '';
      for (let i = 0; i < chineseChars.length; i++) {
        const initial = getPinyinInitial(chineseChars[i]);
        if (initial) {
          key += initial;
        }
        // 限制最大长度为8
        if (key.length >= 8) break;
      }
      if (key.length >= 2) {
        return key.toUpperCase();
      }
    }
  }

  // 如果是英文，取前几个字母（去除空格和特殊字符）
  const englishKey = label.replace(/[^a-zA-Z0-9]/g, '').substring(0, 8).toUpperCase();
  if (englishKey.length >= 2) {
    return englishKey;
  }

  // 最后使用默认名称
  return `FIELD${index + 1}`;
}

// 获取中文字符的拼音首字母（扩展版）
function getPinyinInitial(char) {
  // 扩展的拼音首字母映射表
  const pinyinMap = {
    // 常用字
    '收': 'S', '件': 'J', '受': 'S', '理': 'L', '审': 'S', '查': 'C',
    '决': 'J', '定': 'D', '制': 'Z', '证': 'Z', '送': 'S', '达': 'D',
    '办': 'B', '人': 'R', '时': 'S', '限': 'X', '标': 'B', '准': 'Z',
    '结': 'J', '果': 'G', '权': 'Q', '力': 'L', '来': 'L', '源': 'Y',
    '责': 'Z', '任': 'R', '事': 'S', '项': 'X', '处': 'C', '罚': 'F',
    '行': 'X', '为': 'W', '种': 'Z', '类': 'L', '幅': 'F', '度': 'D',
    '咨': 'Z', '询': 'X', '方': 'F', '式': 'S', '监': 'J', '督': 'D',
    '投': 'T', '诉': 'S', '复': 'F', '议': 'Y', '部': 'B', '门': 'M',
    '地': 'D', '址': 'Z', '电': 'D', '话': 'H', '诉': 'S', '讼': 'S',
    '行': 'X', '政': 'Z', '信': 'X', '息': 'X', '法': 'F', '律': 'L',
    '信': 'X', '息': 'X', '内': 'N', '容': 'R', '名': 'M', '称': 'C',
    '地': 'D', '址': 'Z', '电': 'D', '话': 'H', '邮': 'Y', '箱': 'X',
    '联': 'L', '系': 'X', '方': 'F', '式': 'S', '备': 'B', '注': 'Z',
    '说': 'S', '明': 'M', '描': 'M', '述': 'S', '详': 'X', '细': 'X',
    '日': 'R', '期': 'Q', '时': 'S', '间': 'J', '年': 'N', '月': 'Y',
    '数': 'S', '量': 'L', '金': 'J', '额': 'E', '价': 'J', '格': 'G',
    '单': 'D', '位': 'W', '类': 'L', '型': 'X', '状': 'Z', '态': 'T',
    '级': 'J', '别': 'B', '等': 'D', '级': 'J', '优': 'Y', '先': 'X',
    '必': 'B', '填': 'T', '选': 'X', '择': 'Z', '输': 'S', '入': 'R'
  };
  
  return pinyinMap[char] || null;
}

// 下载配置文件（自动更新索引）
async function downloadConfig() {
  if (!window.currentGeneratedConfig) {
    showMessage('请先生成 JSON 配置', 'error');
    return;
  }
  
  const jsonText = document.getElementById('jsonOutput').textContent;
  const configId = window.currentGeneratedConfig.id;
  
  // 下载配置文件
  const blob = new Blob([jsonText], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${configId}.json`;
  a.click();
  URL.revokeObjectURL(url);

  // 自动更新并下载索引文件
  await updateAndDownloadIndex();
  
  showMessage('配置文件已下载，更新后的索引文件也已下载，请将两个文件放到对应位置', 'success');
}

// 更新并下载索引文件
async function updateAndDownloadIndex() {
  if (!window.currentGeneratedConfig) {
    return;
  }

  try {
    // 加载现有的配置索引
    const response = await fetch('configs-index.json');
    let configsIndex;
    
    if (response.ok) {
      configsIndex = await response.json();
    } else {
      // 如果文件不存在，创建新的索引
      configsIndex = {
        configs: [],
        default: null
      };
    }

    const config = window.currentGeneratedConfig;
    const configId = config.id;
    
    // 检查配置是否已存在
    const existingIndex = configsIndex.configs.findIndex(c => c.id === configId);
    const newConfigEntry = {
      id: config.id,
      name: config.name,
      description: config.description,
      file: `configs/${configId}.json`
    };

    if (existingIndex >= 0) {
      // 更新现有配置
      configsIndex.configs[existingIndex] = newConfigEntry;
    } else {
      // 添加新配置
      configsIndex.configs.push(newConfigEntry);
    }

    // 如果没有默认配置，设置第一个为默认
    if (!configsIndex.default && configsIndex.configs.length > 0) {
      configsIndex.default = configsIndex.configs[0].id;
    }

    // 延迟一下，确保第一个下载完成
    setTimeout(() => {
      // 生成更新后的索引文件供下载
      const indexJson = JSON.stringify(configsIndex, null, 2);
      const blob = new Blob([indexJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'configs-index.json';
      a.click();
      URL.revokeObjectURL(url);
    }, 300);
  } catch (error) {
    console.error('更新配置索引失败:', error);
    // 即使失败也不影响配置文件下载
  }
}

// 更新配置索引
async function updateConfigsIndex() {
  if (!window.currentGeneratedConfig) {
    showMessage('请先生成 JSON 配置', 'error');
    return;
  }

  try {
    // 加载现有的配置索引
    const response = await fetch('configs-index.json');
    let configsIndex;
    
    if (response.ok) {
      configsIndex = await response.json();
    } else {
      // 如果文件不存在，创建新的索引
      configsIndex = {
        configs: [],
        default: null
      };
    }

    const config = window.currentGeneratedConfig;
    const configId = config.id;
    
    // 检查配置是否已存在
    const existingIndex = configsIndex.configs.findIndex(c => c.id === configId);
    const newConfigEntry = {
      id: config.id,
      name: config.name,
      description: config.description,
      file: `configs/${configId}.json`
    };

    if (existingIndex >= 0) {
      // 更新现有配置
      configsIndex.configs[existingIndex] = newConfigEntry;
      showMessage('配置索引已更新（覆盖现有配置）', 'info');
    } else {
      // 添加新配置
      configsIndex.configs.push(newConfigEntry);
      showMessage('配置索引已更新（添加新配置）', 'success');
    }

    // 如果没有默认配置，设置第一个为默认
    if (!configsIndex.default && configsIndex.configs.length > 0) {
      configsIndex.default = configsIndex.configs[0].id;
    }

    // 生成更新后的索引文件供下载
    const indexJson = JSON.stringify(configsIndex, null, 2);
    const blob = new Blob([indexJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'configs-index.json';
    a.click();
    URL.revokeObjectURL(url);

    showMessage('已生成更新后的 configs-index.json，请替换项目中的原文件', 'success');
  } catch (error) {
    console.error('更新配置索引失败:', error);
    showMessage('更新配置索引失败: ' + error.message, 'error');
  }
}

// 显示调试 HTML
function showDebugHtml() {
  if (!htmlContent) {
    showMessage('没有可查看的 HTML 内容', 'error');
    return;
  }

  // 创建新窗口显示 HTML
  const newWindow = window.open('', '_blank');
  if (newWindow) {
    newWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>解析的 HTML 内容</title>
        <style>
          body { 
            font-family: monospace; 
            padding: 20px; 
            background: #1a202c;
            color: #68d391;
          }
          pre {
            white-space: pre-wrap;
            word-wrap: break-word;
            max-width: 100%;
          }
        </style>
      </head>
      <body>
        <h2>解析的 HTML 内容</h2>
        <p>内容长度: ${htmlContent.length} 字符</p>
        <pre>${htmlContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
      </body>
      </html>
    `);
    newWindow.document.close();
  } else {
    // 如果弹窗被阻止，显示在控制台
    console.log('解析的 HTML 内容:', htmlContent);
    showMessage('HTML 内容已输出到控制台（F12 查看）', 'info');
  }
}

// 显示消息
function showMessage(message, type = 'info') {
  const messageDiv = document.getElementById('message');
  messageDiv.className = type === 'error' ? 'error-box' : type === 'success' ? 'success-box' : 'info-box';
  messageDiv.textContent = message;
  messageDiv.style.display = 'block';

  if (type === 'success') {
    setTimeout(() => {
      messageDiv.style.display = 'none';
    }, 3000);
  }
}


