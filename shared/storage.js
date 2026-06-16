const SCHEMA_VERSION = 2;

const WebFormStorage = {
  async getSchemaVersion() {
    const result = await chrome.storage.local.get(['schemaVersion']);
    return result.schemaVersion || 1;
  },

  async setSchemaVersion(version) {
    await chrome.storage.local.set({ schemaVersion: version });
  },

  async getConfigsIndex() {
    const result = await chrome.storage.local.get(['configsIndex']);
    if (result.configsIndex) {
      return result.configsIndex;
    }

    try {
      const response = await fetch(chrome.runtime.getURL('configs-index.json'));
      if (response.ok) {
        const index = await response.json();
        await this.saveConfigsIndex(index);
        return index;
      }
    } catch (e) {
      console.warn('无法加载 configs-index.json:', e);
    }

    return { configs: [], default: null };
  },

  async saveConfigsIndex(index) {
    await chrome.storage.local.set({ configsIndex: index });
  },

  async getConfig(configId) {
    const key = `config_${configId}`;
    const result = await chrome.storage.local.get([key]);
    if (result[key]) {
      return result[key];
    }

    const index = await this.getConfigsIndex();
    const entry = index.configs?.find((c) => c.id === configId);
    if (!entry) {
      return null;
    }

    try {
      const response = await fetch(chrome.runtime.getURL(entry.file));
      if (response.ok) {
        const data = await response.json();
        await this.saveConfig(configId, data);
        return data;
      }
    } catch (e) {
      console.warn(`无法从文件加载配置 ${configId}:`, e);
    }

    return null;
  },

  async saveConfig(configId, data) {
    await chrome.storage.local.set({ [`config_${configId}`]: data });
  },

  async deleteConfig(configId) {
    await chrome.storage.local.remove([`config_${configId}`]);
  },

  async upsertConfigInIndex(configData) {
    const index = await this.getConfigsIndex();
    const entry = {
      id: configData.id,
      name: configData.name,
      description: configData.description || '',
      file: `configs/${configData.id}.json`
    };

    const existingIndex = index.configs.findIndex((c) => c.id === configData.id);
    if (existingIndex >= 0) {
      index.configs[existingIndex] = entry;
    } else {
      index.configs.push(entry);
    }

    if (!index.default && index.configs.length > 0) {
      index.default = index.configs[0].id;
    }

    await this.saveConfig(configData.id, configData);
    await this.saveConfigsIndex(index);
    return index;
  },

  async removeConfigFromIndex(configId) {
    const index = await this.getConfigsIndex();
    index.configs = index.configs.filter((c) => c.id !== configId);

    if (index.default === configId) {
      index.default = index.configs.length > 0 ? index.configs[0].id : null;
    }

    await this.deleteConfig(configId);
    await this.saveConfigsIndex(index);
    return index;
  },

  async getSavedFormDataList() {
    const result = await chrome.storage.local.get(['savedConfigs']);
    return result.savedConfigs || [];
  },

  async saveSavedFormDataList(list) {
    await chrome.storage.local.set({ savedConfigs: list });
  },

  async migrateDefaultsOnInstall() {
    let index = await this.getConfigsIndex();
    if (!index.configs) {
      index.configs = [];
    }

    const defaultFiles = [
      { id: 'process-steps', file: 'configs/process-steps.json' },
      { id: 'legal-info', file: 'configs/legal-info.json' }
    ];

    for (const def of defaultFiles) {
      const inIndex = index.configs.some((c) => c.id === def.id);
      const stored = await chrome.storage.local.get([`config_${def.id}`]);

      if (!inIndex || !stored[`config_${def.id}`]) {
        try {
          const response = await fetch(chrome.runtime.getURL(def.file));
          if (!response.ok) continue;

          const configData = await response.json();
          await this.saveConfig(def.id, configData);

          if (!inIndex) {
            index.configs.push({
              id: def.id,
              name: configData.name,
              description: configData.description || '',
              file: def.file
            });
          }
        } catch (e) {
          console.warn(`迁移配置 ${def.id} 失败:`, e);
        }
      }
    }

    if (!index.default && index.configs.length > 0) {
      index.default = index.configs[0].id;
    }

    await this.saveConfigsIndex(index);
    await this.setSchemaVersion(SCHEMA_VERSION);
  }
};
