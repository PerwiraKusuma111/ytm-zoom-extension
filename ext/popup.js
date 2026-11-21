const rng = document.getElementById('rng');
const zval = document.getElementById('zval');
const noZoom = document.getElementById('noZoom');
const deskUA = document.getElementById('deskUA');
const btnApply = document.getElementById('btnApply');
const st = document.getElementById('st');
const pbtns = Array.from(document.querySelectorAll('.pbtn'));

function renderZoom(pct) {
  rng.value = pct;
  zval.textContent = pct + '%';
  pbtns.forEach((b) => b.classList.toggle('act', Number(b.dataset.z) === pct));
}

function save(partial) {
  chrome.storage.local.set(partial);
}

chrome.storage.local.get({ zoom: 2.5, desktopUA: false, noZoom: true }, (d) => {
  renderZoom(Math.round((d.zoom || 2.5) * 100));
  noZoom.checked = d.noZoom !== false;
  deskUA.checked = Boolean(d.desktopUA);
});

rng.addEventListener('input', () => {
  const pct = Number(rng.value);
  renderZoom(pct);
  save({ zoom: pct / 100 });
});

pbtns.forEach((b) => {
  b.addEventListener('click', () => {
    const pct = Number(b.dataset.z);
    renderZoom(pct);
    save({ zoom: pct / 100 });
  });
});

noZoom.addEventListener('change', () => {
  save({ noZoom: noZoom.checked });
});

deskUA.addEventListener('change', () => {
  const on = deskUA.checked;
  const pct = on ? 100 : 250;
  renderZoom(pct);
  save({ desktopUA: on, zoom: pct / 100 });
  st.textContent = on ? 'Matikan Situs Desktop di browser lalu tekan Reload' : 'Nyalakan Situs Desktop di browser lalu tekan Reload';
});

btnApply.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'APPLY_RELOAD' }, () => {
    st.textContent = 'Diterapkan ke YouTube Music!';
    setTimeout(() => { st.textContent = ''; }, 2000);
  });
});
