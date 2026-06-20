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
  var touchMode  = null;   // 'place' | 'pan' | 'gesture'
  var twoFinger  = null;   // previous two-finger positions (canvas-relative)
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
    on('mResultClose', hideResult);
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
      hideResult();
      if (MOBILE_MQ.matches) resizeCanvasToContainer();
      refreshUI();
    });
    document.addEventListener('points:changed', function (e) {
      var d = e.detail || state();
      if (d.index < d.total) analyzed = false;
      hideResult();                 // any marking change invalidates a shown result
      refreshUI(d);
    });
    document.addEventListener('analysis:complete', function (e) {
      analyzed = true;
      refreshUI();
      showResult(e.detail);
    });
    document.addEventListener('image:error', function (e) {
      imageLoaded = false;
      analyzed = false;
      hideResult();
      refreshUI();
      if (elStepText) elStepText.textContent = 'Couldn’t load that photo — tap Upload to try another';
      showToast((e.detail && e.detail.message) || 'Could not load image.');
    });
  }

  // Prominent result banner — the estimated valve setting is the tool's whole output,
  // so surface it clearly on mobile (desktop still shows it in #instructions).
  function showResult(d) {
    var el = document.getElementById('mResult');
    if (!el) return;
    var valueEl = document.getElementById('mResultSetting');
    var subEl = document.getElementById('mResultSub');
    var labelEl = el.querySelector('.m-result-label');
    if (!d || d.inconclusive) {
      el.classList.add('inconclusive');
      if (labelEl) labelEl.textContent = 'Inconclusive';
      if (valueEl) valueEl.textContent = (d && d.nearest) ? (d.nearest[0] + '–' + d.nearest[1]) : '?';
      if (subEl) subEl.textContent = 'Repeat the X-ray';
    } else {
      el.classList.remove('inconclusive');
      if (labelEl) labelEl.textContent = 'Estimated setting';
      if (valueEl) valueEl.textContent = d.setting;
      if (subEl) subEl.textContent = (d.angle != null) ? ('Angle ' + Number(d.angle).toFixed(1) + '°') : '';
    }
    el.classList.add('show');
  }

  function hideResult() {
    var el = document.getElementById('mResult');
    if (el) el.classList.remove('show');
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
      touchMode = 'gesture';
      twoFinger = twoTouchPoints(e);
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

    if (touchMode === 'gesture' && e.touches.length === 2) {
      e.preventDefault();
      var now = twoTouchPoints(e);
      // One similarity transform (pan + pinch-zoom + twist-rotate) mapping the
      // previous finger positions onto the new ones, applied to the viewport.
      var M = similarityFromPairs(twoFinger.p0, twoFinger.p1, now.p0, now.p1);
      var next = fabric.util.multiplyTransformMatrices(M, canvas.viewportTransform);
      var sc = Math.hypot(next[0], next[1]);
      if (sc >= 0.2 && sc <= 20) canvas.setViewportTransform(next);
      twoFinger = now;

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

    } else if (touchMode === 'gesture') {
      if (e.touches.length === 1) {
        touchMode = imageLoaded ? 'pan' : null;
        panLast = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 0) {
        touchMode = null; twoFinger = null;
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
  // Two current touch points in canvas-element coordinates.
  function twoTouchPoints(e) {
    var rect = canvas.upperCanvasEl.getBoundingClientRect();
    return {
      p0: { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top },
      p1: { x: e.touches[1].clientX - rect.left, y: e.touches[1].clientY - rect.top }
    };
  }

  // Similarity transform (translate + rotate + uniform scale) mapping finger pair
  // a0,a1 onto b0,b1 — the pan/zoom/rotate implied by a two-finger move.
  function similarityFromPairs(a0, a1, b0, b1) {
    var vax = a1.x - a0.x, vay = a1.y - a0.y;
    var vbx = b1.x - b0.x, vby = b1.y - b0.y;
    var da = Math.hypot(vax, vay) || 1;
    var db = Math.hypot(vbx, vby) || 1;
    var s = db / da;
    var ang = Math.atan2(vby, vbx) - Math.atan2(vay, vax);
    var cos = Math.cos(ang) * s, sin = Math.sin(ang) * s;
    var RS   = [cos, sin, -sin, cos, 0, 0];        // rotate + uniform scale
    var Tneg = [1, 0, 0, 1, -a0.x, -a0.y];         // a0 -> origin
    var Tpos = [1, 0, 0, 1, b0.x, b0.y];           // origin -> b0
    var m = fabric.util.multiplyTransformMatrices(RS, Tneg);
    return fabric.util.multiplyTransformMatrices(Tpos, m);
  }

  // Convert a viewport point to Fabric scene coordinates. Full matrix inverse, so
  // it stays correct even after the two-finger gesture introduces rotation.
  function clientToScene(clientX, clientY) {
    if (!canvas) return null;
    var rect = canvas.upperCanvasEl.getBoundingClientRect();
    var p = { x: clientX - rect.left, y: clientY - rect.top };
    var inv = fabric.util.invertTransform(canvas.viewportTransform);
    var sc = fabric.util.transformPoint(p, inv);
    return { x: sc.x, y: sc.y };
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
