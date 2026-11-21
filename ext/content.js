(function () {
  'use strict';

  var host = (location.hostname || '').toLowerCase();
  if (!host) return;

  var noZoomEnabled = false;
  var styleEl = null;

  function applyNoZoom(on) {
    noZoomEnabled = Boolean(on);
    if (noZoomEnabled) {
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'smz-nozoom-style';
        styleEl.textContent =
          'html,body{touch-action:pan-x pan-y!important}' +
          '::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}' +
          '*{scrollbar-width:none!important}';
      }
      if (!styleEl.isConnected) (document.head || document.documentElement).appendChild(styleEl);
    } else if (styleEl && styleEl.isConnected) {
      styleEl.remove();
    }
  }

  function blockPinch(e) {
    if (noZoomEnabled && e.touches && e.touches.length > 1) e.preventDefault();
  }

  document.addEventListener('touchstart', blockPinch, { passive: false });
  document.addEventListener('touchmove', blockPinch, { passive: false });
  document.addEventListener('gesturestart', function (e) {
    if (noZoomEnabled) e.preventDefault();
  }, { passive: false });

  function syncFromSites(sites) {
    var cfg = sites && sites[host];
    applyNoZoom(Boolean(cfg && cfg.noZoom));
  }

  try {
    chrome.storage.local.get({ sites: null }, function (d) {
      if (d.sites) syncFromSites(d.sites);
      else if (host === 'music.youtube.com') applyNoZoom(true);
    });
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === 'local' && changes.sites) syncFromSites(changes.sites.newValue);
    });
  } catch (e) {}
})();
