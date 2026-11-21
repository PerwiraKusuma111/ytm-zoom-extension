(function () {
  'use strict';

  var noZoomEnabled = true;
  var styleEl = document.createElement('style');
  styleEl.id = 'ytm-mobile-zoom-style';

  function updateStyle() {
    styleEl.textContent =
      (noZoomEnabled ? 'html,body,ytmusic-app{touch-action:pan-x pan-y!important}' : '') +
      '::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}' +
      '*{scrollbar-width:none!important}';
  }

  updateStyle();
  (document.head || document.documentElement).appendChild(styleEl);

  function blockPinch(e) {
    if (noZoomEnabled && e.touches && e.touches.length > 1) {
      e.preventDefault();
    }
  }

  document.addEventListener('touchstart', blockPinch, { passive: false });
  document.addEventListener('touchmove', blockPinch, { passive: false });
  document.addEventListener('gesturestart', function (e) {
    if (noZoomEnabled) e.preventDefault();
  }, { passive: false });

  try {
    chrome.storage.local.get({ noZoom: true }, function (d) {
      noZoomEnabled = d.noZoom !== false;
      updateStyle();
    });
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === 'local' && changes.noZoom) {
        noZoomEnabled = changes.noZoom.newValue !== false;
        updateStyle();
      }
    });
  } catch (e) {}
})();
