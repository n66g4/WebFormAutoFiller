// 全局变量
let configsIndex = null;
let currentConfig = null;

// 初始化：加载配置索引
document.addEventListener('DOMContentLoaded', () => {
  loadConfigsIndex();
  setupSavedConfigs();
  loadSavedConfigsList();
  setupConfigParserLink();
  setupConfigTypeActions();
});

// 设置配置解析工具链接
function setupConfigParserLink() {
  const link = document.getElementById('configParserLink');
  if (link && chrome.runtime) {
    link.href = chrome.runtime.getURL('config-parser.html');
  }
}


// 生成表单字段
function generateFormFields(savedData = null) {
  if (!currentConfig) return;
  
  const formFields = document.getElementById('formFields');
  formFields.innerHTML = '';
  
  // 按配置的 mappings 顺序生成字段
  Object.keys(currentConfig.mappings).forEach(key => {
    const chineseName = currentConfig.mappings[key];
    const fieldDiv = document.createElement('div');
    fieldDiv.className = 'form-field';
    
    const label = document.createElement('label');
    label.textContent = chineseName;
    label.setAttribute('for', `field_${key}`);
    
    // 判断字段类型（时限字段可能是数字）
    const isNumber = key.includes('T') && (key.includes('时限') || key.endsWith('T'));
    const input = document.createElement('input');
    input.type = isNumber ? 'number' : 'text';
    input.id = `field_${key}`;
    input.name = key;
    input.placeholder = `请输入${chineseName}`;
    
    // 如果有保存的数据，填充到字段中
    if (savedData && savedData[key] !== undefined) {
      input.value = savedData[key];
    }
    
    fieldDiv.appendChild(label);
    fieldDiv.appendChild(input);
    formFields.appendChild(fieldDiv);
  });
}

// 设置已保存配置的功能
function setupSavedConfigs() {
  const saveBtn = document.getElementById('saveConfigBtn');
  const importBtn = document.getElementById('importConfigBtn');
  const importFileInput = document.getElementById('importFileInput');
  const exportBtn = document.getElementById('exportConfigBtn');
  const deleteBtn = document.getElementById('deleteConfigBtn');
  const select = document.getElementById('savedConfigsSelect');
  
  if (saveBtn) {
    saveBtn.addEventListener('click', saveCurrentFormData);
  }
  
  if (importBtn) {
    importBtn.addEventListener('click', () => {
      importFileInput.click();
    });
  }
  
  if (importFileInput) {
    importFileInput.addEventListener('change', handleImportFile);
  }
  
  if (exportBtn) {
    exportBtn.addEventListener('click', exportSelectedConfig);
  }
  
  if (deleteBtn) {
    deleteBtn.addEventListener('click', deleteSelectedConfig);
  }
  
  if (select) {
    // 选择配置时自动加载
    select.addEventListener('change', (e) => {
      if (e.target.value) {
        loadConfigById(e.target.value);
      }
    });
  }
}

// 保存当前表单数据
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
  
  // 获取表单数据
  const formData = {};
  const fields = document.querySelectorAll('#formFields input');
  let hasData = false;
  
  fields.forEach(field => {
    const value = field.value.trim();
    if (value) hasData = true;
    formData[field.name] = value;
  });
  
  if (!hasData) {
    showMessage('请至少填写一个字段', 'error');
    return;
  }
  
  // 获取配置名称
  const configName = prompt('请输入配置名称:', `${currentConfig.name}_${new Date().toLocaleDateString()}`);
  if (!configName || !configName.trim()) {
    return;
  }
  
  // 保存到 Chrome Storage
  const savedConfig = {
    id: Date.now().toString(),
    name: configName.trim(),
    configId: configId,
    configName: currentConfig.name,
    data: formData,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  try {
    const result = await chrome.storage.local.get(['savedConfigs']);
    const savedConfigs = result.savedConfigs || [];
    savedConfigs.push(savedConfig);
    
    await chrome.storage.local.set({ savedConfigs: savedConfigs });
    
    showMessage('配置保存成功', 'success');
    loadSavedConfigsList();
  } catch (error) {
    console.error('保存配置失败:', error);
    showMessage('保存配置失败: ' + error.message, 'error');
  }
}

// 加载已保存配置列表
async function loadSavedConfigsList() {
  const select = document.getElementById('savedConfigsSelect');
  if (!select) return;
  
  try {
    const result = await chrome.storage.local.get(['savedConfigs']);
    const savedConfigs = result.savedConfigs || [];
    
    select.innerHTML = '<option value="">-- 选择已保存的配置 --</option>';
    
    // 按更新时间倒序排列
    savedConfigs.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    
    savedConfigs.forEach(config => {
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

// 根据 ID 加载配置
async function loadConfigById(configId) {
  try {
    const result = await chrome.storage.local.get(['savedConfigs']);
    const savedConfigs = result.savedConfigs || [];
    const config = savedConfigs.find(c => c.id === configId);
    
    if (!config) {
      showMessage('配置不存在', 'error');
      return;
    }
  
    // 切换到对应的配置类型
    const configSelect = document.getElementById('configSelect');
    configSelect.value = config.configId;
    
    // 加载配置并生成表单
    await updateConfigDescription(config.configId);
    
    // 等待配置加载完成后再填充数据
    setTimeout(() => {
      generateFormFields(config.data);
      showMessage(`已加载配置: ${config.name}`, 'success');
    }, 100);
    
  } catch (error) {
    console.error('加载配置失败:', error);
    showMessage('加载配置失败: ' + error.message, 'error');
  }
}

// 删除选中的配置
async function deleteSelectedConfig() {
  const select = document.getElementById('savedConfigsSelect');
  if (!select || !select.value) {
    showMessage('请先选择一个要删除的配置', 'error');
    return;
  }
  
  // 获取配置名称用于确认
  const result = await chrome.storage.local.get(['savedConfigs']);
  const savedConfigs = result.savedConfigs || [];
  const config = savedConfigs.find(c => c.id === select.value);
  
  if (!config) {
    showMessage('配置不存在', 'error');
    return;
  }
  
  // 确认删除
  if (confirm(`确定要删除配置 "${config.name}" 吗？`)) {
    await deleteSavedConfig(select.value);
    // 清空选择
    select.value = '';
  }
}

// 处理导入文件
async function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const importData = JSON.parse(text);

    // 验证导入数据格式
    if (!importData.name || !importData.data) {
      throw new Error('导入文件格式不正确：缺少必要字段');
    }

    // 检查是否有配置类型信息
    if (!importData.configType) {
      // 尝试从当前选择的配置获取类型
      const configSelect = document.getElementById('configSelect');
      if (!configSelect.value) {
        throw new Error('请先选择配置类型，或确保导入文件包含配置类型信息');
      }
      
      const config = configsIndex.configs.find(c => c.id === configSelect.value);
      if (config) {
        importData.configType = config.name;
        importData.configId = config.id;
      } else {
        throw new Error('无法确定配置类型');
      }
    } else {
      // 根据配置类型名称查找配置 ID
      const config = configsIndex.configs.find(c => c.name === importData.configType);
      if (config) {
        importData.configId = config.id;
      }
    }

    // 构建保存的配置对象
    const savedConfig = {
      id: Date.now().toString(),
      name: importData.name,
      configId: importData.configId || '',
      configName: importData.configType || importData.configName || '未知配置',
      data: importData.data,
      createdAt: importData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // 保存到 Chrome Storage
    const result = await chrome.storage.local.get(['savedConfigs']);
    const savedConfigs = result.savedConfigs || [];
    savedConfigs.push(savedConfig);

    await chrome.storage.local.set({ savedConfigs: savedConfigs });

    showMessage(`成功导入配置: ${savedConfig.name}`, 'success');
    loadSavedConfigsList();

    // 清空文件输入
    event.target.value = '';

    // 可选：自动加载导入的配置
    setTimeout(() => {
      const select = document.getElementById('savedConfigsSelect');
      if (select) {
        select.value = savedConfig.id;
        loadConfigById(savedConfig.id);
      }
    }, 100);

  } catch (error) {
    console.error('导入配置失败:', error);
    showMessage('导入配置失败: ' + error.message, 'error');
    event.target.value = '';
  }
}

// 导出选中的配置
async function exportSelectedConfig() {
  const select = document.getElementById('savedConfigsSelect');
  if (!select || !select.value) {
    showMessage('请先选择一个要导出的配置', 'error');
    return;
  }

  try {
    const result = await chrome.storage.local.get(['savedConfigs']);
    const savedConfigs = result.savedConfigs || [];
    const config = savedConfigs.find(c => c.id === select.value);

    if (!config) {
      showMessage('配置不存在', 'error');
      return;
    }

    // 构建导出数据
    const exportData = {
      name: config.name,
      configType: config.configName,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
      data: config.data
    };

    // 生成 JSON 文件
    const jsonText = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${config.name}_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showMessage('配置导出成功', 'success');
  } catch (error) {
    console.error('导出配置失败:', error);
    showMessage('导出配置失败: ' + error.message, 'error');
  }
}

// 删除已保存的配置
async function deleteSavedConfig(configId) {
  try {
    const result = await chrome.storage.local.get(['savedConfigs']);
    const savedConfigs = result.savedConfigs || [];
    const filtered = savedConfigs.filter(c => c.id !== configId);
    
    await chrome.storage.local.set({ savedConfigs: filtered });
    showMessage('配置已删除', 'success');
    loadSavedConfigsList();
  } catch (error) {
    console.error('删除配置失败:', error);
    showMessage('删除配置失败: ' + error.message, 'error');
  }
}

// 加载配置索引
async function loadConfigsIndex() {
  try {
    // 优先从 Chrome Storage 加载
    const result = await chrome.storage.local.get(['configsIndex']);
    if (result.configsIndex) {
      configsIndex = result.configsIndex;
      populateConfigSelect();
      // 迁移现有配置文件到 Storage（一次性操作）
      migrateConfigsToStorage();
      return;
    }

    // 如果 Storage 中没有，尝试从文件加载（如果文件不存在，创建空索引）
    try {
      const response = await fetch('configs-index.json');
      if (response.ok) {
        configsIndex = await response.json();
        // 保存到 Chrome Storage
        await chrome.storage.local.set({ configsIndex: configsIndex });
        // 迁移现有配置文件到 Storage（一次性操作）
        migrateConfigsToStorage();
      } else {
        // 文件不存在，创建空索引
        configsIndex = {
          configs: [],
          default: null
        };
        await chrome.storage.local.set({ configsIndex: configsIndex });
      }
    } catch (error) {
      // 文件加载失败，创建空索引
      configsIndex = {
        configs: [],
        default: null
      };
      await chrome.storage.local.set({ configsIndex: configsIndex });
    }
    
    populateConfigSelect();
  } catch (error) {
    console.error('加载配置索引失败:', error);
    showMessage('加载配置索引失败: ' + error.message, 'error');
  }
}

// 迁移现有配置文件到 Chrome Storage（一次性操作）
async function migrateConfigsToStorage() {
  if (!configsIndex || !configsIndex.configs) return;
  
  try {
    const storageData = {};
    let hasNewConfigs = false;
    
    // 检查每个配置是否已在 Storage 中
    for (const config of configsIndex.configs) {
      const storageKey = `config_${config.id}`;
      const result = await chrome.storage.local.get([storageKey]);
      
      // 如果 Storage 中没有，从文件系统加载
      if (!result[storageKey]) {
        try {
          const response = await fetch(config.file);
          if (response.ok) {
            const configData = await response.json();
            storageData[storageKey] = configData;
            hasNewConfigs = true;
          }
        } catch (e) {
          console.warn(`无法迁移配置文件 ${config.id}:`, e);
        }
      }
    }
    
    // 如果有新配置，批量保存到 Storage
    if (hasNewConfigs) {
      await chrome.storage.local.set(storageData);
      console.log('已迁移配置文件到 Chrome Storage');
    }
  } catch (error) {
    console.error('迁移配置文件失败:', error);
  }
}

// 填充配置选择下拉框
function populateConfigSelect() {
  const select = document.getElementById('configSelect');
  const description = document.getElementById('configDescription');
  
  select.innerHTML = '';
  
  if (!configsIndex || !configsIndex.configs) {
    select.innerHTML = '<option value="">无可用配置</option>';
    return;
  }

  configsIndex.configs.forEach(config => {
    const option = document.createElement('option');
    option.value = config.id;
    option.textContent = config.name;
    select.appendChild(option);
  });

  // 设置默认配置
  const defaultConfigId = configsIndex.default || configsIndex.configs[0]?.id;
  if (defaultConfigId) {
    select.value = defaultConfigId;
    updateConfigDescription(defaultConfigId);
  }

  // 监听配置选择变化
  select.addEventListener('change', (e) => {
    updateConfigDescription(e.target.value);
  });
}

// 加载配置文件（优先从 Chrome Storage，如果没有则从文件系统加载）
async function loadConfigFile(configId) {
  try {
    // 优先从 Chrome Storage 加载
    const result = await chrome.storage.local.get([`config_${configId}`]);
    if (result[`config_${configId}`]) {
      return result[`config_${configId}`];
    }

    // 如果 Storage 中没有，从文件系统加载
    const config = configsIndex?.configs?.find(c => c.id === configId);
    if (!config) {
      throw new Error('配置不存在');
    }

    const response = await fetch(config.file);
    if (!response.ok) {
      throw new Error('无法加载配置文件');
    }
    const configData = await response.json();
    
    // 保存到 Chrome Storage（下次可以直接使用）
    await chrome.storage.local.set({ [`config_${configId}`]: configData });
    
    return configData;
  } catch (error) {
    console.error('加载配置文件失败:', error);
    throw error;
  }
}

// 更新配置描述
async function updateConfigDescription(configId) {
  const description = document.getElementById('configDescription');
  const config = configsIndex?.configs?.find(c => c.id === configId);
  
  if (config && config.description) {
    description.textContent = config.description;
    description.style.display = 'block';
  } else {
    description.style.display = 'none';
  }
  
  // 如果配置改变，重新生成表单字段
  if (configId && config) {
    try {
      const configData = await loadConfigFile(configId);
      currentConfig = configData;
      generateFormFields();
    } catch (error) {
      console.error('加载配置失败:', error);
    }
  }
  
  return Promise.resolve();
}

// 提交按钮事件
document.getElementById('submitButton').addEventListener('click', async () => {
  const configSelect = document.getElementById('configSelect');
  const selectedConfigId = configSelect.value;

  // 验证配置选择
  if (!selectedConfigId) {
    showMessage('请先选择一个配置', 'error');
    return;
  }

  try {
    // 加载选中的配置
    currentConfig = await loadConfigFile(selectedConfigId);

    // 处理表单输入
    await processFormInput();

  } catch (error) {
    console.error('处理失败:', error);
    showMessage('处理失败: ' + error.message, 'error');
  }
});

// 处理表单输入
async function processFormInput() {
  const formData = {};
  const fields = document.querySelectorAll('#formFields input');
  
  fields.forEach(field => {
    const key = field.name;
    formData[key] = field.value || '';
  });

  // 验证必填字段（可以根据需要添加）
  const hasData = Object.values(formData).some(val => val.trim() !== '');
  if (!hasData) {
    throw new Error('请至少填写一个字段');
  }

  // 映射数据字段
  const mappedData = mapData(formData, currentConfig.mappings);

  // 填充表单（单条数据）
  fillFormOnPage([mappedData], currentConfig.fieldMappings);

  showMessage('表单填充成功', 'success');
}

// 将数据映射到目标字段
function mapData(entry, mappings) {
  const mappedEntry = {};
  Object.keys(mappings).forEach(key => {
    mappedEntry[mappings[key]] = entry[key];
  });
  return mappedEntry;
}

// 在页面上填充表单
function fillFormOnPage(jsonData, fieldMappings) {
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (!tabs[0]) {
      throw new Error('无法获取当前标签页');
    }

    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      function: fillForm,
      args: [jsonData, fieldMappings]
    }, (results) => {
      if (chrome.runtime.lastError) {
        console.error('执行脚本失败:', chrome.runtime.lastError);
        showMessage('执行脚本失败: ' + chrome.runtime.lastError.message, 'error');
      }
    });
  });
}

// 填充表单函数（将在页面上下文中执行）
function fillForm(data, fieldMappings) {
  let successCount = 0;
  let errorCount = 0;
  const errors = [];

  data.forEach((entry, index) => {
    Object.keys(entry).forEach(key => {
      const xpath = fieldMappings[key];
      if (!xpath) {
        console.warn(`字段 "${key}" 没有对应的 XPath 映射`);
        return;
      }

      try {
        const result = document.evaluate(
          xpath,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        );

        if (result.singleNodeValue) {
          const element = result.singleNodeValue;
          element.value = entry[key] || '';

          // 触发 input 事件
          element.dispatchEvent(new Event('input', { bubbles: true }));
          // 触发 change 事件
          element.dispatchEvent(new Event('change', { bubbles: true }));

          successCount++;
        } else {
          const errorMsg = `未找到 XPath: ${xpath} (字段: ${key})`;
          console.error(errorMsg);
          errors.push(errorMsg);
          errorCount++;
        }
      } catch (error) {
        const errorMsg = `XPath 执行错误: ${xpath} - ${error.message}`;
        console.error(errorMsg);
        errors.push(errorMsg);
        errorCount++;
      }
    });
  });

  // 在控制台输出结果
  console.log(`表单填充完成: 成功 ${successCount} 个字段, 失败 ${errorCount} 个字段`);
  if (errors.length > 0) {
    console.warn('填充错误详情:', errors);
  }
}

// 设置配置类型操作按钮
function setupConfigTypeActions() {
  const importBtn = document.getElementById('importConfigTypeBtn');
  const importFileInput = document.getElementById('importConfigTypeInput');
  const exportBtn = document.getElementById('exportConfigTypeBtn');
  const deleteBtn = document.getElementById('deleteConfigTypeBtn');

  if (importBtn && importFileInput) {
    importBtn.addEventListener('click', () => {
      importFileInput.click();
    });
    importFileInput.addEventListener('change', handleImportConfigType);
  }

  if (exportBtn) {
    exportBtn.addEventListener('click', handleExportConfigType);
  }

  if (deleteBtn) {
    deleteBtn.addEventListener('click', handleDeleteConfigType);
  }
}

// 处理导入配置类型
async function handleImportConfigType(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const configData = JSON.parse(text);

    // 验证配置文件格式
    if (!configData.id || !configData.name || !configData.fieldMappings || !configData.mappings) {
      throw new Error('配置文件格式不正确：缺少必要字段（id, name, fieldMappings, mappings）');
    }

    // 生成配置 ID（如果不存在或需要覆盖）
    const configId = configData.id;
    const configName = configData.name;
    const configDescription = configData.description || '';

    // 保存配置文件到 Chrome Storage
    await chrome.storage.local.set({ [`config_${configId}`]: configData });

    // 更新配置索引（自动保存到 Chrome Storage）
    await updateConfigsIndexForImport(configId, configName, configDescription);

    showMessage(`配置文件已导入（已自动保存，立即可用）`, 'success');
    
    // 重新加载配置索引和列表
    setTimeout(() => {
      populateConfigSelect();
    }, 100);

    // 清空文件输入
    event.target.value = '';
  } catch (error) {
    console.error('导入配置失败:', error);
    showMessage('导入配置失败: ' + error.message, 'error');
    event.target.value = '';
  }
}

// 更新配置索引（用于导入）
async function updateConfigsIndexForImport(configId, configName, configDescription) {
  try {
    // 优先从 Chrome Storage 加载
    let configsIndex;
    const result = await chrome.storage.local.get(['configsIndex']);
    
    if (result.configsIndex) {
      configsIndex = result.configsIndex;
    } else {
      // 如果 Storage 中没有，尝试从文件加载
      try {
        const response = await fetch('configs-index.json');
        if (response.ok) {
          configsIndex = await response.json();
        } else {
          // 如果文件不存在，创建新的索引
          configsIndex = {
            configs: [],
            default: null
          };
        }
      } catch (e) {
        // 如果文件加载失败，创建新的索引
        configsIndex = {
          configs: [],
          default: null
        };
      }
    }

    // 检查配置是否已存在
    const existingIndex = configsIndex.configs.findIndex(c => c.id === configId);
    const newConfigEntry = {
      id: configId,
      name: configName,
      description: configDescription,
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

    // 保存到 Chrome Storage（自动更新，无需手动替换文件）
    await chrome.storage.local.set({ configsIndex: configsIndex });
    
    // 更新全局变量
    configsIndex = configsIndex;

    // 延迟一下，确保配置文件下载完成
    setTimeout(() => {
      // 可选：仍然生成更新后的索引文件供下载（用于备份或版本控制）
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
    throw error;
  }
}

// 处理导出配置类型
async function handleExportConfigType() {
  const configSelect = document.getElementById('configSelect');
  const selectedConfigId = configSelect.value;

  if (!selectedConfigId) {
    showMessage('请先选择一个要导出的配置', 'error');
    return;
  }

  try {
    const config = configsIndex.configs.find(c => c.id === selectedConfigId);
    if (!config) {
      showMessage('配置不存在', 'error');
      return;
    }

    // 加载配置文件
    const response = await fetch(config.file);
    if (!response.ok) {
      throw new Error('无法加载配置文件');
    }
    const configData = await response.json();

    // 下载配置文件
    const jsonText = JSON.stringify(configData, null, 2);
    const blob = new Blob([jsonText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedConfigId}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showMessage('配置导出成功', 'success');
  } catch (error) {
    console.error('导出配置失败:', error);
    showMessage('导出配置失败: ' + error.message, 'error');
  }
}

// 处理删除配置类型
async function handleDeleteConfigType() {
  const configSelect = document.getElementById('configSelect');
  const selectedConfigId = configSelect.value;

  if (!selectedConfigId) {
    showMessage('请先选择一个要删除的配置', 'error');
    return;
  }

  try {
    const config = configsIndex.configs.find(c => c.id === selectedConfigId);
    if (!config) {
      showMessage('配置不存在', 'error');
      return;
    }

    // 确认删除
    if (!confirm(`确定要删除配置 "${config.name}" 吗？`)) {
      return;
    }

    // 从索引中移除配置
    const updatedConfigs = configsIndex.configs.filter(c => c.id !== selectedConfigId);
    
    // 如果删除的是默认配置，设置新的默认配置
    let newDefault = configsIndex.default;
    if (configsIndex.default === selectedConfigId) {
      newDefault = updatedConfigs.length > 0 ? updatedConfigs[0].id : null;
    }

    const updatedIndex = {
      configs: updatedConfigs,
      default: newDefault
    };

    // 从 Chrome Storage 中删除配置文件和索引
    await chrome.storage.local.remove([`config_${selectedConfigId}`]);
    await chrome.storage.local.set({ configsIndex: updatedIndex });
    
    // 更新全局变量
    configsIndex = updatedIndex;

    // 可选：仍然生成更新后的索引文件供下载（用于备份或版本控制）
    const indexJson = JSON.stringify(updatedIndex, null, 2);
    const blob = new Blob([indexJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'configs-index.json';
    a.click();
    URL.revokeObjectURL(url);

    showMessage(`配置已删除（已自动清理）`, 'success');
    
    // 重新加载配置索引
    setTimeout(() => {
      populateConfigSelect();
    }, 100);
  } catch (error) {
    console.error('删除配置失败:', error);
    showMessage('删除配置失败: ' + error.message, 'error');
  }
}

// 显示消息
function showMessage(message, type = 'info') {
  const messageDiv = document.getElementById('message');
  messageDiv.textContent = message;
  messageDiv.className = `message message-${type}`;
  messageDiv.style.display = 'block';

  // 3秒后自动隐藏成功消息
  if (type === 'success') {
    setTimeout(() => {
      messageDiv.style.display = 'none';
    }, 3000);
  }
}
