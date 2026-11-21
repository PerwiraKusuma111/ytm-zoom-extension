const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const DEFAULT_SITES = {
  'music.youtube.com': { zoom: 2.5, desktopUA: false, noZoom: true }
};
const touchedTabs = new Set();

function getHost(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.hostname.toLowerCase();
  } catch (e) {
    return '';
  }
}

async function getSites() {
  const data = await chrome.storage.local.get({ sites: null });
  if (data.sites && typeof data.sites === 'object') return data.sites;
  await chrome.storage.local.set({ sites: DEFAULT_SITES });
  return Object.assign({}, DEFAULT_SITES);
}

let lastUAKey = null;

async function syncUARules(sites) {
  try {
    const uaHosts = Object.entries(sites)
      .filter(([, cfg]) => cfg && cfg.desktopUA)
      .map(([host]) => host)
      .sort();
    const key = uaHosts.join(',');
    if (key === lastUAKey) return;

    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = existing.map((r) => r.id);
    const addRules = uaHosts.map((host, idx) => ({
      id: idx + 1,
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
        urlFilter: '||' + host + '^',
        resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest', 'script', 'other']
      }
    }));
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
    lastUAKey = key;
  } catch (e) {}
}

async function applyTab(tabId, url, sites, forceReset) {
  const host = getHost(url);
  if (!host) return;
  const cfg = sites[host];
  if (cfg && typeof cfg.zoom === 'number') {
    touchedTabs.add(tabId);
    try {
      if (chrome.tabs.setZoomSettings) {
        await chrome.tabs.setZoomSettings(tabId, { mode: 'automatic', scope: 'per-origin' });
      }
    } catch (e) {}
    try {
      const cur = await chrome.tabs.getZoom(tabId);
      if (Math.abs(cur - cfg.zoom) > 0.02) {
        await chrome.tabs.setZoom(tabId, cfg.zoom);
      }
    } catch (e) {}
  } else if (forceReset || touchedTabs.has(tabId)) {
    touchedTabs.delete(tabId);
    try {
      const cur = await chrome.tabs.getZoom(tabId);
      if (Math.abs(cur - 1.0) > 0.02) {
        await chrome.tabs.setZoom(tabId, 1.0);
      }
    } catch (e) {}
  }
}

async function applyAll(targetHost, reloadTarget, forceReset) {
  const sites = await getSites();
  await syncUARules(sites);
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id == null || !tab.url) continue;
      const host = getHost(tab.url);
      if (!host) continue;
      if (!targetHost || host === targetHost) {
        await applyTab(tab.id, tab.url, sites, Boolean(forceReset && host === targetHost));
        if (reloadTarget && host === targetHost) chrome.tabs.reload(tab.id);
      }
    }
  } catch (e) {}
}

chrome.runtime.onInstalled.addListener(async () => {
  await getSites();
  await applyAll('', false, false);
});

chrome.runtime.onStartup.addListener(() => {
  applyAll('', false, false);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const url = changeInfo.url || (tab && tab.url) || '';
  if (!url) return;
  if (changeInfo.status === 'loading' || changeInfo.status === 'complete' || changeInfo.url) {
    const sites = await getSites();
    await applyTab(tabId, url, sites, false);
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab && tab.url) {
      const sites = await getSites();
      await applyTab(tabId, tab.url, sites, false);
    }
  } catch (e) {}
});

chrome.tabs.onRemoved.addListener((tabId) => {
  touchedTabs.delete(tabId);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.sites) applyAll('', false, false);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'APPLY_HOST') {
    applyAll(msg.host || '', Boolean(msg.reload), Boolean(msg.reset)).then(() => sendResponse({ ok: true }));
    return true;
  }
});
