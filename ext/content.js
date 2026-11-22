(function () {
  'use strict';

  var host = (location.hostname || '').toLowerCase();
  if (!host) return;

  var extApi = (typeof browser !== 'undefined' && browser.storage) ? browser : (typeof chrome !== 'undefined' ? chrome : null);
  var isFirefox = (typeof browser !== 'undefined' && /firefox|gecko/i.test(navigator.userAgent || '') && !/chrome|edg/i.test(navigator.userAgent || ''));

  var noZoomEnabled = false;
  var styleEl = null;
  var zoomStyleEl = null;

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

  // Firefox Android tidak punya API tabs.setZoom, jadi pakai CSS zoom standar (didukung Firefox 126+)
  function applyCssZoom(z) {
    if (!isFirefox) return;
    if (typeof z === 'number' && Math.abs(z - 1.0) > 0.02) {
      if (!zoomStyleEl) {
        zoomStyleEl = document.createElement('style');
        zoomStyleEl.id = 'smz-ff-zoom-style';
      }
      zoomStyleEl.textContent = 'html{zoom:' + z.toFixed(2) + '!important}';
      if (!zoomStyleEl.isConnected) (document.head || document.documentElement).appendChild(zoomStyleEl);
    } else if (zoomStyleEl && zoomStyleEl.isConnected) {
      zoomStyleEl.remove();
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
    applyCssZoom(cfg && typeof cfg.zoom === 'number' ? cfg.zoom : 1.0);
  }

  try {
    if (extApi && extApi.storage && extApi.storage.local) {
      var handleData = function (d) {
        if (d && d.sites) syncFromSites(d.sites);
        else if (host === 'music.youtube.com') {
          applyNoZoom(true);
          applyCssZoom(2.5);
        }
      };
      var p = extApi.storage.local.get({ sites: null }, handleData);
      if (p && typeof p.then === 'function') p.then(handleData, function () {});
      extApi.storage.onChanged.addListener(function (changes, area) {
        if (area === 'local' && changes.sites) syncFromSites(changes.sites.newValue);
      });
    }
  } catch (e) {}
})();
