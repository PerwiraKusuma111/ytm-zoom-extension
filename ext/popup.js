const hostLbl = document.getElementById('hostLbl');
const controls = document.getElementById('controls');
const rng = document.getElementById('rng');
const zval = document.getElementById('zval');
const noZoom = document.getElementById('noZoom');
const deskUA = document.getElementById('deskUA');
const btnApply = document.getElementById('btnApply');
const btnReset = document.getElementById('btnReset');
const st = document.getElementById('st');
const savedWrap = document.getElementById('savedWrap');
const savedList = document.getElementById('savedList');
const pbtns = Array.from(document.querySelectorAll('.pbtn'));

let curHost = '';
let sites = {};

function getHost(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.hostname.toLowerCase();
  } catch (e) {
    return '';
  }
}

function renderZoom(pct) {
  rng.value = pct;
  zval.textContent = pct + '%';
  pbtns.forEach((b) => b.classList.toggle('act', Number(b.dataset.z) === pct));
}

function renderSaved() {
  const keys = Object.keys(sites).sort();
  while (savedList.firstChild) savedList.removeChild(savedList.firstChild);
  if (!keys.length) {
    savedWrap.style.display = 'none';
    return;
  }
  savedWrap.style.display = 'block';
  for (const h of keys) {
    const c = sites[h] || {};
    const row = document.createElement('div');
    row.className = 'sitem';
    const sh = document.createElement('span');
    sh.className = 'shost';
    sh.textContent = h;
    const sm = document.createElement('span');
    sm.className = 'smeta';
    sm.textContent = Math.round((c.zoom || 1) * 100) + '%' + (c.desktopUA ? ' • PC' : '');
    const del = document.createElement('button');
    del.className = 'sdel';
    del.textContent = '×';
    del.onclick = () => {
      delete sites[h];
      chrome.storage.local.set({ sites }, () => {
        chrome.runtime.sendMessage({ type: 'APPLY_HOST', host: h, reload: false, reset: true });
        if (h === curHost) loadCurrentUI();
        renderSaved();
      });
    };
    row.append(sh, sm, del);
    savedList.appendChild(row);
  }
}

function loadCurrentUI() {
  const cfg = (curHost && sites[curHost]) || { zoom: 1.0, desktopUA: false, noZoom: false };
  renderZoom(Math.round((cfg.zoom || 1) * 100));
  noZoom.checked = Boolean(cfg.noZoom);
  deskUA.checked = Boolean(cfg.desktopUA);
}

function saveCurrent(partial) {
  if (!curHost) return;
  const base = sites[curHost] || { zoom: 1.0, desktopUA: false, noZoom: false };
  sites[curHost] = Object.assign({}, base, partial);
  chrome.storage.local.set({ sites }, () => {
    renderSaved();
  });
}

async function init() {
  const data = await chrome.storage.local.get({ sites: null });
  sites = (data.sites && typeof data.sites === 'object')
    ? data.sites
    : { 'music.youtube.com': { zoom: 2.5, desktopUA: false, noZoom: true } };

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs && tabs[0];
  curHost = tab && tab.url ? getHost(tab.url) : '';

  if (!curHost) {
    hostLbl.textContent = 'Buka website dulu';
    controls.classList.add('dis');
  } else {
    hostLbl.textContent = curHost;
    loadCurrentUI();
  }
  renderSaved();
}

let sliderTimer = null;
rng.addEventListener('input', () => {
  const pct = Number(rng.value);
  renderZoom(pct);
  clearTimeout(sliderTimer);
  sliderTimer = setTimeout(() => saveCurrent({ zoom: pct / 100 }), 80);
});

rng.addEventListener('change', () => {
  clearTimeout(sliderTimer);
  const pct = Number(rng.value);
  renderZoom(pct);
  saveCurrent({ zoom: pct / 100 });
});

pbtns.forEach((b) => {
  b.addEventListener('click', () => {
    const pct = Number(b.dataset.z);
    renderZoom(pct);
    saveCurrent({ zoom: pct / 100 });
  });
});

noZoom.addEventListener('change', () => {
  saveCurrent({ noZoom: noZoom.checked });
});

deskUA.addEventListener('change', () => {
  const on = deskUA.checked;
  saveCurrent({ desktopUA: on });
  st.textContent = on ? 'Desktop UA aktif — klik Terapkan & Reload' : 'Desktop UA mati — klik Terapkan & Reload';
});

btnApply.addEventListener('click', () => {
  if (!curHost) return;
  chrome.runtime.sendMessage({ type: 'APPLY_HOST', host: curHost, reload: true }, () => {
    st.textContent = 'Tersimpan untuk ' + curHost;
    setTimeout(() => { st.textContent = ''; }, 2000);
  });
});

btnReset.addEventListener('click', () => {
  if (!curHost) return;
  delete sites[curHost];
  chrome.storage.local.set({ sites }, () => {
    loadCurrentUI();
    renderSaved();
    chrome.runtime.sendMessage({ type: 'APPLY_HOST', host: curHost, reload: true, reset: true }, () => {
      st.textContent = curHost + ' dikembalikan ke 100%';
      setTimeout(() => { st.textContent = ''; }, 2000);
    });
  });
});

init();
