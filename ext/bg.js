const api = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;
const IS_FIREFOX = (typeof browser !== 'undefined' && typeof navigator !== 'undefined' && /firefox|gecko/i.test(navigator.userAgent || '') && !/chrome|edg/i.test(navigator.userAgent || ''));
const DESKTOP_UA = IS_FIREFOX
  ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0'
  : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const DEFAULT_SITES = {
  'music.youtube.com': { zoom: 2.5, desktopUA: false, noZoom: true }
};
const touchedTabs = new Set();
let uaHostSet = new Set();

function getHost(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.hostname.toLowerCase();
  } catch (e) {
    return '';
  }
}

function storageGet(defaults) {
  return new Promise((resolve) => {
    try {
      const res = api.storage.local.get(defaults, (d) => resolve(d || defaults));
      if (res && typeof res.then === 'function') {
        res.then((d) => resolve(d || defaults), () => resolve(defaults));
      }
    } catch (e) {
      resolve(defaults);
    }
  });
}

function storageSet(obj) {
  return new Promise((resolve) => {
    try {
      const res = api.storage.local.set(obj, () => resolve());
      if (res && typeof res.then === 'function') {
        res.then(() => resolve(), () => resolve());
      }
    } catch (e) {
      resolve();
    }
  });
}

function queryTabs(queryInfo) {
  return new Promise((resolve) => {
    try {
      const res = api.tabs.query(queryInfo, (tabs) => resolve(tabs || []));
      if (res && typeof res.then === 'function') {
        res.then((tabs) => resolve(tabs || []), () => resolve([]));
      }
    } catch (e) {
      resolve([]);
    }
  });
}

function getTab(tabId) {
  return new Promise((resolve) => {
    try {
      const res = api.tabs.get(tabId, (tab) => resolve(tab || null));
      if (res && typeof res.then === 'function') {
        res.then((tab) => resolve(tab || null), () => resolve(null));
      }
    } catch (e) {
      resolve(null);
    }
  });
}

async function getSites() {
  const data = await storageGet({ sites: null });
  if (data.sites && typeof data.sites === 'object') return data.sites;
  await storageSet({ sites: DEFAULT_SITES });
  return Object.assign({}, DEFAULT_SITES);
}

// Firefox Android (Manifest V2): ubah header User-Agent per-situs lewat webRequestBlocking
if (api.webRequest && api.webRequest.onBeforeSendHeaders) {
  try {
    api.webRequest.onBeforeSendHeaders.addListener(
      (details) => {
        if (!uaHostSet.size || !details.requestHeaders) return {};
        const h = getHost(details.url);
        if (!h || !uaHostSet.has(h)) return {};
        const headers = details.requestHeaders.filter((hd) => {
          const n = (hd.name || '').toLowerCase();
          return n !== 'user-agent' && n !== 'sec-ch-ua-mobile' && n !== 'sec-ch-ua-platform';
        });
        headers.push({ name: 'User-Agent', value: DESKTOP_UA });
        return { requestHeaders: headers };
      },
      { urls: ['http://*/*', 'https://*/*'] },
      ['blocking', 'requestHeaders']
    );
  } catch (e) {}
}

let lastUAKey = null;

async function syncUARules(sites) {
  const uaHosts = Object.entries(sites)
    .filter(([, cfg]) => cfg && cfg.desktopUA)
    .map(([host]) => host)
    .sort();
  uaHostSet = new Set(uaHosts);

  const key = uaHosts.join(',');
  if (key === lastUAKey) return;
  if (!api.declarativeNetRequest || !api.declarativeNetRequest.updateDynamicRules) {
    lastUAKey = key;
    return;
  }
  try {
    const existing = await api.declarativeNetRequest.getDynamicRules();
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
    await api.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
    lastUAKey = key;
  } catch (e) {}
}

async function applyTab(tabId, url, sites, forceReset) {
  if (!api.tabs || !api.tabs.getZoom || !api.tabs.setZoom) return;
  const host = getHost(url);
  if (!host) return;
  const cfg = sites[host];
  if (cfg && typeof cfg.zoom === 'number') {
    touchedTabs.add(tabId);
    try {
      if (api.tabs.setZoomSettings) {
        await api.tabs.setZoomSettings(tabId, { mode: 'automatic', scope: 'per-origin' });
      }
    } catch (e) {}
    try {
      const cur = await api.tabs.getZoom(tabId);
      if (Math.abs(cur - cfg.zoom) > 0.02) {
        await api.tabs.setZoom(tabId, cfg.zoom);
      }
    } catch (e) {}
  } else if (forceReset || touchedTabs.has(tabId)) {
    touchedTabs.delete(tabId);
    try {
      const cur = await api.tabs.getZoom(tabId);
      if (Math.abs(cur - 1.0) > 0.02) {
        await api.tabs.setZoom(tabId, 1.0);
      }
    } catch (e) {}
  }
}

async function applyAll(targetHost, reloadTarget, forceReset) {
  const sites = await getSites();
  await syncUARules(sites);
  try {
    const tabs = await queryTabs({});
    for (const tab of tabs) {
      if (tab.id == null || !tab.url) continue;
      const host = getHost(tab.url);
      if (!host) continue;
      if (!targetHost || host === targetHost) {
        await applyTab(tab.id, tab.url, sites, Boolean(forceReset && host === targetHost));
        if (reloadTarget && host === targetHost) api.tabs.reload(tab.id);
      }
    }
  } catch (e) {}
}

if (api.runtime && api.runtime.onInstalled) {
  api.runtime.onInstalled.addListener(async () => {
    await getSites();
    await applyAll('', false, false);
  });
}

if (api.runtime && api.runtime.onStartup) {
  api.runtime.onStartup.addListener(() => {
    applyAll('', false, false);
  });
}

if (api.tabs && api.tabs.onUpdated) {
  api.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    const url = changeInfo.url || (tab && tab.url) || '';
    if (!url) return;
    if (changeInfo.status === 'loading' || changeInfo.status === 'complete' || changeInfo.url) {
      const sites = await getSites();
      await applyTab(tabId, url, sites, false);
    }
  });
}

if (api.tabs && api.tabs.onActivated) {
  api.tabs.onActivated.addListener(async ({ tabId }) => {
    try {
      const tab = await getTab(tabId);
      if (tab && tab.url) {
        const sites = await getSites();
        await applyTab(tabId, tab.url, sites, false);
      }
    } catch (e) {}
  });
}

if (api.tabs && api.tabs.onRemoved) {
  api.tabs.onRemoved.addListener((tabId) => {
    touchedTabs.delete(tabId);
  });
}

if (api.storage && api.storage.onChanged) {
  api.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.sites) applyAll('', false, false);
  });
}

if (api.runtime && api.runtime.onMessage) {
  api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'APPLY_HOST') {
      const p = applyAll(msg.host || '', Boolean(msg.reload), Boolean(msg.reset)).then(() => ({ ok: true }));
      if (typeof browser !== 'undefined' && browser.runtime === api.runtime) {
        return p;
      }
      p.then((res) => sendResponse(res));
      return true;
    }
  });
}

applyAll('', false, false);
