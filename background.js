importScripts('shared/storage.js');

chrome.runtime.onInstalled.addListener(() => {
  WebFormStorage.migrateDefaultsOnInstall().then(() => {
    console.log('WebFormAutoFiller: 默认配置已就绪');
  }).catch((error) => {
    console.error('WebFormAutoFiller: 初始化失败', error);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'SAVE_RECORDED_CONFIG') {
    WebFormStorage.upsertConfigInIndex(message.config)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.action === 'GET_RECORDING_STATUS') {
    sendResponse({ ok: true });
    return true;
  }

  return false;
});
