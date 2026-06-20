/* ============================================================
   mobile.js — Phone-first behaviour for the Certas X-ray Analyzer.

   Adds, only on phones (<768px):
     - touch gestures: 1 finger = place current point via a magnifier
       loupe, 2 fingers = pinch-zoom + pan
     - a context-aware bottom toolbar + pull-up sheet
     - wizard step text + progress, driven by events app.js dispatches

   It operates on the Fabric `canvas` global and the helper functions
   declared in app.js (placePoint, fitImageToCanvas, rotateCanvas, ...),
   all of which share the global scope. Desktop behaviour is untouched.
   ============================================================ */
(function () {
  'use strict';

  var MOBILE_MQ   = window.matchMedia('(max-width: 767.98px)');
  var LOUPE_SIZE  = 96;    // CSS px (matches mobile.css)
  var LOUPE_ZOOM  = 2.5;   // magnification
  var LOUPE_GAP   = 56;    // px the loupe floats above the fingertip

  var analyzed    = false;
  var imageLoaded = false;

  // Touch state
  var touchMode  = null;   // 'place' | 'pan' | 'pinch'
  var pinchStart = null;
  var panLast    = null;

  // Cached elements
  var elStepText, elProgress, elPrimary, elDownload, elSheet, elBackdrop,
      elToast, loupeEl, loupeCanvas, loupeCtx;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    cacheElements();
    if (!loupeEl) return;             // markup missing — bail quietly
    setupLoupeCanvas();
    wireToolbar();
    wireSheet();
    wireGuides();
    wireRotation();
    bindAppEvents();
    setupTouch();
    setupResize();
    refreshUI();
    // Fit the Fabric canvas to the mobile container once layout settles.
    if (MOBILE_MQ.matches) requestAnimationFrame(resizeCanvasToContainer);
  }

  function cacheElements() {
    elStepText  = document.getElementById('mStepText');
    elProgress  = document.getElementById('mProgress');
    elPrimary   = document.getElementById('mPrimaryBtn');
    elDownload  = document.getElementById('mDownloadBtn');
    elSheet     = document.getElementById('mobileSheet');
    elBackdrop  = document.getElementById('mobileSheetBackdrop');
    elToast     = document.getElementById('mToast');
    loupeEl     = document.getElementById('loupe');
    loupeCanvas = document.getElementById('loupeCanvas');
  }

  function setupLoupeCanvas() {
    var dpr = window.devicePixelRatio || 1;
    loupeCanvas.width  = LOUPE_SIZE * dpr;
    loupeCanvas.height = LOUPE_SIZE * dpr;
    loupeCtx = loupeCanvas.getContext('2d');
  }

  /* ---------- current marking state (read live globals) ---------- */
  function state() {
    return {
      count: (typeof points !== 'undefined' && points) ? points.length : 0,
      index: (typeof currentPointIndex !== 'undefined') ? currentPointIndex : 0,
      total: (typeof pointLabels !== 'undefined' && pointLabels) ? pointLabels.length : 5
    };
  }

  /* ---------- toolbar ---------- */
  function wireToolbar() {
    // #mUploadBtn is a <label for="imageUpload"> — it opens the picker natively.
    // No JS .click() here, or the picker would be triggered twice per tap.
    on('mFlipBtn',   function () { if (canvas && canvas.backgroundImage && typeof flipHorizontal === 'function') flipHorizontal(); });
    on('mUndoBtn',   function () { if (typeof removeLastPoint === 'function') removeLastPoint(); });
    on('mMoreBtn',   function () { toggleSheet(); });
    on('mPrimaryBtn', onPrimary);
  }

  function onPrimary() {
    if (analyzed) {
      if (typeof downloadAnalysis === 'function') downloadAnalysis();
      return;
    }
    var s = state();
    if (s.index >= s.total && typeof analyzeImage === 'function') analyzeImage();
  }

  /* ---------- pull-up sheet ---------- */
  function wireSheet() {
    on('mSheetHandle', toggleSheet);
    on('mResetBtn', function () { if (typeof resetMarkings === 'function') resetMarkings(); closeSheet(); });
    on('mDownloadBtn', function () { if (typeof downloadAnalysis === 'function') downloadAnalysis(); });
    if (elBackdrop) elBackdrop.addEventListener('click', closeSheet);
  }
  function toggleSheet() { elSheet.classList.contains('open') ? closeSheet() : openSheet(); }
  function openSheet()  { elSheet.classList.add('open'); if (elBackdrop) elBackdrop.classList.add('open'); }
  function closeSheet() { elSheet.classList.remove('open'); if (elBackdrop) elBackdrop.classList.remove('open'); }

  /* ---------- reference-guide PDFs ---------- */
  function wireGuides() {
    if (!elSheet) return;
    var links = elSheet.querySelectorAll('[data-pdf]');
    for (var i = 0; i < links.length; i++) {
      links[i].addEventListener('click', function (e) {
        if (typeof openPdfGuide === 'function') openPdfGuide(e); else e.preventDefault();
        closeSheet();
      });
    }
  }

  /* ---------- rotation slider (mirrors the desktop one) ---------- */
  function wireRotation() {
    var slider = document.getElementById('mRotationSlider');
    if (slider) slider.addEventListener('input', function (e) {
      if (typeof rotateCanvas === 'function') rotateCanvas(parseInt(e.target.value, 10));
    });
  }

  /* ---------- app -> mobile events ---------- */
  function bindAppEvents() {
    document.addEventListener('image:loaded', function () {
      imageLoaded = true;
      analyzed = false;
      if (MOBILE_MQ.matches) resizeCanvasToContainer();
      refreshUI();
    });
    document.addEventListener('points:changed', function (e) {
      var d = e.detail || state();
      if (d.index < d.total) analyzed = false;
      refreshUI(d);
    });
    document.addEventListener('analysis:complete', function () {
      analyzed = true;
      refreshUI();
    });
    document.addEventListener('image:error', function (e) {
      imageLoaded = false;
      analyzed = false;
      refreshUI();
      if (elStepText) elStepText.textContent = 'Couldn’t load that photo — tap Upload to try another';
      showToast((e.detail && e.detail.message) || 'Could not load image.');
    });
  }

  // Transient error banner for image-load failures (e.g. HEIC / unreadable photo).
  var toastTimer = null;
  function showToast(msg) {
    if (!elToast) return;
    elToast.textContent = msg;
    elToast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { elToast.classList.remove('show'); }, 7000);
  }

  /* ---------- UI refresh (step text, progress, primary button) ---------- */
  function refreshUI(s) {
    s = s || state();

    // progress segments
    if (elProgress) {
      var segs = elProgress.children;
      for (var i = 0; i < segs.length; i++) {
        segs[i].classList.toggle('filled', i < s.count);
      }
    }

    // step text
    if (elStepText) {
      if (!imageLoaded) {
        elStepText.textContent = 'Upload an X-ray to begin';
      } else if (s.index < s.total) {
        var label = (typeof pointLabels !== 'undefined') ? pointLabels[s.index] : '';
        elStepText.textContent = 'Step ' + (s.index + 1) + ' of ' + s.total + ' · Mark the ' + label;
      } else if (analyzed) {
        elStepText.textContent = 'Analysis complete — tap Download to save';
      } else {
        elStepText.textContent = 'All ' + s.total + ' points marked — tap Analyze';
      }
    }

    // context-aware primary button
    if (elPrimary) {
      if (analyzed) {
        elPrimary.textContent = '↓ Download';
        elPrimary.classList.add('download');
        elPrimary.disabled = false;
      } else {
        elPrimary.textContent = 'Analyze';
        elPrimary.classList.remove('download');
        elPrimary.disabled = !(imageLoaded && s.index >= s.total);
      }
    }
    if (elDownload) elDownload.disabled = !analyzed;
  }

  /* ---------- touch gestures ---------- */
  function setupTouch() {
    if (!canvas || !canvas.upperCanvasEl) return;
    var el = canvas.upperCanvasEl;
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove',  onTouchMove,  { passive: false });
    el.addEventListener('touchend',   onTouchEnd,   { passive: false });
    el.addEventListener('touchcancel', onTouchCancel, { passive: false });
  }

  function isPlacing() {
    var s = state();
    return imageLoaded && s.index < s.total;
  }

  function onTouchStart(e) {
    if (!MOBILE_MQ.matches || !canvas) return;

    if (e.touches.length === 2) {
      e.preventDefault();
      touchMode = 'pinch';
      pinchStart = gestureInfo(e.touches[0], e.touches[1]);
      hideLoupe();
      return;
    }
    if (e.touches.length === 1) {
      if (isPlacing()) {
        e.preventDefault();
        touchMode = 'place';
        showLoupe();
        updateLoupe(e.touches[0]);
      } else if (imageLoaded) {
        touchMode = 'pan';
        panLast = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    }
  }

  function onTouchMove(e) {
    if (!canvas) return;

    if (touchMode === 'pinch' && e.touches.length === 2) {
      e.preventDefault();
      var now = gestureInfo(e.touches[0], e.touches[1]);
      var zoom = canvas.getZoom() * (now.dist / pinchStart.dist);
      zoom = Math.min(Math.max(zoom, 0.2), 20);
      var rect = canvas.upperCanvasEl.getBoundingClientRect();
      canvas.zoomToPoint(new fabric.Point(now.mid.x - rect.left, now.mid.y - rect.top), zoom);
      canvas.relativePan(new fabric.Point(now.mid.x - pinchStart.mid.x, now.mid.y - pinchStart.mid.y));
      pinchStart = now;

    } else if (touchMode === 'place' && e.touches.length === 1) {
      e.preventDefault();
      updateLoupe(e.touches[0]);

    } else if (touchMode === 'pan' && e.touches.length === 1) {
      e.preventDefault();
      var t = e.touches[0];
      canvas.relativePan(new fabric.Point(t.clientX - panLast.x, t.clientY - panLast.y));
      panLast = { x: t.clientX, y: t.clientY };
    }
  }

  function onTouchEnd(e) {
    if (touchMode === 'place') {
      var t = e.changedTouches[0];
      hideLoupe();
      var scene = clientToScene(t.clientX, t.clientY);
      if (scene && typeof placePoint === 'function') placePoint(scene.x, scene.y);
      touchMode = null;

    } else if (touchMode === 'pinch') {
      if (e.touches.length === 1) {
        touchMode = imageLoaded ? 'pan' : null;
        panLast = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 0) {
        touchMode = null; pinchStart = null;
      }

    } else if (touchMode === 'pan' && e.touches.length === 0) {
      touchMode = null; panLast = null;
    }
  }

  function onTouchCancel() {
    hideLoupe();
    touchMode = null; pinchStart = null; panLast = null;
  }

  /* ---------- geometry helpers ---------- */
  function gestureInfo(a, b) {
    var dx = b.clientX - a.clientX, dy = b.clientY - a.clientY;
    return {
      dist: Math.hypot(dx, dy) || 1,
      mid: { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }
    };
  }

  // Convert a viewport point to Fabric scene coordinates (zoom + pan only).
  function clientToScene(clientX, clientY) {
    if (!canvas) return null;
    var rect = canvas.upperCanvasEl.getBoundingClientRect();
    var px = clientX - rect.left, py = clientY - rect.top;
    var vpt = canvas.viewportTransform;
    return { x: (px - vpt[4]) / vpt[0], y: (py - vpt[5]) / vpt[3] };
  }

  /* ---------- loupe rendering ---------- */
  function showLoupe() { loupeEl.classList.add('show'); }
  function hideLoupe() { loupeEl.classList.remove('show'); }

  function updateLoupe(touch) {
    var rect = canvas.upperCanvasEl.getBoundingClientRect();
    var px = touch.clientX - rect.left;
    var py = touch.clientY - rect.top;
    var src = canvas.lowerCanvasEl;
    var retina = (canvas.getRetinaScaling ? canvas.getRetinaScaling() : (window.devicePixelRatio || 1));
    var dpr = window.devicePixelRatio || 1;

    var win = LOUPE_SIZE / LOUPE_ZOOM;          // CSS px window sampled under finger
    var sx = (px - win / 2) * retina;
    var sy = (py - win / 2) * retina;
    var sw = win * retina, sh = win * retina;

    loupeCtx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS-px coords
    loupeCtx.clearRect(0, 0, LOUPE_SIZE, LOUPE_SIZE);
    loupeCtx.fillStyle = '#0b1622';
    loupeCtx.fillRect(0, 0, LOUPE_SIZE, LOUPE_SIZE);
    try {
      loupeCtx.drawImage(src, sx, sy, sw, sh, 0, 0, LOUPE_SIZE, LOUPE_SIZE);
    } catch (err) { /* off-image edge — ignore */ }

    // crosshair
    loupeCtx.strokeStyle = 'rgba(255, 210, 63, 0.95)';
    loupeCtx.lineWidth = 1;
    loupeCtx.beginPath();
    loupeCtx.moveTo(LOUPE_SIZE / 2, 10); loupeCtx.lineTo(LOUPE_SIZE / 2, LOUPE_SIZE - 10);
    loupeCtx.moveTo(10, LOUPE_SIZE / 2); loupeCtx.lineTo(LOUPE_SIZE - 10, LOUPE_SIZE / 2);
    loupeCtx.stroke();
    loupeCtx.fillStyle = 'rgba(255, 77, 77, 0.95)';
    loupeCtx.beginPath();
    loupeCtx.arc(LOUPE_SIZE / 2, LOUPE_SIZE / 2, 2.5, 0, Math.PI * 2);
    loupeCtx.fill();

    // position above the fingertip, clamped to the viewport
    var left = touch.clientX - LOUPE_SIZE / 2;
    var top  = touch.clientY - LOUPE_GAP - LOUPE_SIZE;
    if (top < 6) top = touch.clientY + LOUPE_GAP;     // flip below finger near the top edge
    left = Math.max(6, Math.min(left, window.innerWidth - LOUPE_SIZE - 6));
    loupeEl.style.left = left + 'px';
    loupeEl.style.top  = top + 'px';
  }

  /* ---------- responsive canvas ---------- */
  function setupResize() {
    var raf = null;
    window.addEventListener('resize', function () {
      if (!MOBILE_MQ.matches) return;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(resizeCanvasToContainer);
    });
    window.addEventListener('orientationchange', function () {
      setTimeout(resizeCanvasToContainer, 250);
    });
  }

  function resizeCanvasToContainer() {
    if (!canvas || !MOBILE_MQ.matches) return;
    var container = document.querySelector('.main-content .canvas-container') ||
                    document.querySelector('.canvas-container');
    if (!container) return;
    var w = Math.floor(container.clientWidth);
    var h = Math.floor(container.clientHeight);
    if (w < 2 || h < 2) return;

    canvas.setWidth(w);
    canvas.setHeight(h);
    // Only re-fit the image when nothing is marked yet, so we never
    // shift already-placed points out of alignment with the X-ray.
    if (state().count === 0 && canvas.backgroundImage && typeof fitImageToCanvas === 'function') {
      canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
      fitImageToCanvas(canvas.backgroundImage);
    }
    canvas.requestRenderAll();
  }

  /* ---------- tiny helper ---------- */
  function on(id, handler) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', handler);
  }
})();
