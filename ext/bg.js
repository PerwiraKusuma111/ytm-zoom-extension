const DEFAULTS = { zoom: 2.5, desktopUA: false, noZoom: true };
const YTM_PREFIX = 'https://music.youtube.com/';
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const RULE_ID = 1;

async function getCfg() {
  const data = await chrome.storage.local.get(DEFAULTS);
  return {
    zoom: typeof data.zoom === 'number' ? data.zoom : DEFAULTS.zoom,
    desktopUA: Boolean(data.desktopUA),
    noZoom: data.noZoom !== false
  };
}

async function syncUARule(enabled) {
  try {
    if (enabled) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [RULE_ID],
        addRules: [{
          id: RULE_ID,
          priority: 1,
          action: {
            type: 'modifyHeaders',
            requestHeaders: [
              { header: 'User-Agent', operation: 'set', value: DESKTOP_UA },
              { header: 'Sec-CH-UA-Mobile', operation: 'set', value: '?0' },
              { header: 'Sec-CH-UA-Platform', operation: 'set', value: '"Windows"' }
            ]
          },
          condition: {
            urlFilter: '||music.youtube.com^',
            resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest', 'script', 'other']
          }
        }]
      });
    } else {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [RULE_ID]
      });
    }
  } catch (e) {}
}

async function applyZoomToTab(tabId, url, cfg) {
  if (!url || !url.startsWith(YTM_PREFIX)) return;
  try {
    if (chrome.tabs.setZoomSettings) {
      await chrome.tabs.setZoomSettings(tabId, { mode: 'automatic', scope: 'per-tab' });
    }
  } catch (e) {}
  try {
    const cur = await chrome.tabs.getZoom(tabId);
    if (Math.abs(cur - cfg.zoom) > 0.02) {
      await chrome.tabs.setZoom(tabId, cfg.zoom);
    }
  } catch (e) {}
}

async function applyAll(reloadYtm) {
  const cfg = await getCfg();
  await syncUARule(cfg.desktopUA);
  try {
    const tabs = await chrome.tabs.query({ url: 'https://music.youtube.com/*' });
    for (const tab of tabs) {
      if (tab.id != null) {
        await applyZoomToTab(tab.id, tab.url, cfg);
        if (reloadYtm) chrome.tabs.reload(tab.id);
      }
    }
  } catch (e) {}
}

chrome.runtime.onInstalled.addListener(async () => {
  const cur = await chrome.storage.local.get(null);
  const init = Object.assign({}, DEFAULTS, cur);
  await chrome.storage.local.set(init);
  await applyAll(false);
});

chrome.runtime.onStartup.addListener(() => {
  applyAll(false);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const url = changeInfo.url || (tab && tab.url) || '';
  if (!url.startsWith(YTM_PREFIX)) return;
  if (changeInfo.status === 'loading' || changeInfo.status === 'complete' || changeInfo.url) {
    const cfg = await getCfg();
    await applyZoomToTab(tabId, url, cfg);
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab && tab.url && tab.url.startsWith(YTM_PREFIX)) {
      const cfg = await getCfg();
      await applyZoomToTab(tabId, tab.url, cfg);
    }
  } catch (e) {}
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') applyAll(false);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'APPLY_RELOAD') {
    applyAll(true).then(() => sendResponse({ ok: true }));
    return true;
  }
});
