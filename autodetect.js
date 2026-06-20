/* ============================================================
   autodetect.js — EXPERIMENTAL AI assist for the Certas analyzer.

   Runs a small ONNX model (valve_model.onnx, ~0.36 MB) fully in the browser
   via onnxruntime-web. On an uploaded X-ray it:
     - places the 5 marker points (from predicted heatmaps), which the user can
       then drag to adjust and Analyze as usual, and
     - shows the model's direct setting estimate (from its angle head) as a
       cross-check.

   IMPORTANT: this model was trained on a very small dataset (43 unique valves)
   and does NOT reliably generalize (leak-free accuracy ~24%). It is an
   experimental aid only — the clinician must verify every result manually. The
   UI is labelled accordingly.

   Pure add-on: reuses app.js globals (canvas, placePoint, resetMarkings,
   determineValveSetting, pointLabels, fitImageToCanvas). No existing behaviour
   changes.
   ============================================================ */
(function () {
  'use strict';

  var ORT_CDN = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/ort.min.js';
  var MODEL_URL = 'valve_model.onnx?v=20260620b';
  var IMG_SIZE = 256, HM_SIZE = 64;
  var MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];

  var session = null;
  var loadingPromise = null;

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('autoDetectBtn');
    var mBtn = document.getElementById('mAutoDetectBtn');
    if (btn) btn.addEventListener('click', runAutoDetect);
    if (mBtn) mBtn.addEventListener('click', runAutoDetect);
    // enable the buttons once an image is loaded
    document.addEventListener('image:loaded', function () {
      if (btn) btn.disabled = false;
      if (mBtn) mBtn.disabled = false;
    });
  });

  function loadOrt() {
    if (window.ort) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = ORT_CDN;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Could not load the AI runtime.')); };
      document.head.appendChild(s);
    });
  }

  function getSession() {
    if (session) return Promise.resolve(session);
    if (loadingPromise) return loadingPromise;
    loadingPromise = loadOrt()
      .then(function () {
        // Single-threaded WASM: the multi-threaded backend needs SharedArrayBuffer,
        // which requires COOP/COEP cross-origin-isolation headers a static host
        // won't set. Single-threaded runs anywhere and is plenty for a 0.36 MB model.
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.simd = true;
        return ort.InferenceSession.create(MODEL_URL, { executionProviders: ['wasm'] });
      })
      .then(function (s) { session = s; return s; });
    return loadingPromise;
  }

  async function runAutoDetect() {
    // app.js declares `canvas` with top-level `let` (shared script scope, NOT a
    // window property) — reference it by its lexical name, not window.canvas.
    if (typeof canvas === 'undefined' || !canvas || !canvas.backgroundImage) {
      status('Upload an X-ray first.', 'warn');
      return;
    }
    status('Loading AI model…', 'info');
    var sess;
    try {
      sess = await getSession();
    } catch (e) {
      status('AI model unavailable (offline?). You can still mark points manually.', 'warn');
      return;
    }

    try {
      status('Analysing…', 'info');
      var pre = preprocess();                          // {tensor, view}
      var feeds = { image: pre.tensor };
      var out = await sess.run(feeds);
      var hm = out.heatmaps;                            // [1,5,64,64]
      var sincos = out.sincos.data;                    // [sin, cos]

      var pts = decodeHeatmaps(hm.data);               // 5 normalized (viewport letterbox)
      placeDetectedPoints(pts, pre.view);

      var theta = (Math.atan2(sincos[0], sincos[1]) * 180 / Math.PI + 360) % 360;
      var modelSetting = (typeof determineValveSetting === 'function')
        ? determineValveSetting(theta) : null;

      // cross-check: setting computed from the just-placed points (existing math)
      var pointsSetting = settingFromPlacedPoints();
      showResult(modelSetting, pointsSetting, theta);
    } catch (e) {
      console.error('Auto-detect failed:', e);
      status('Auto-detect failed — please mark the points manually.', 'warn');
    }
  }

  // ---- preprocessing: render the VISIBLE viewport (the zoomed valve view the user
  // sees) -> letterbox to 256 -> ImageNet normalize, CHW float. Processing the
  // zoomed view means the valve fills more of the model's input. ----
  function preprocess() {
    var W = Math.round(canvas.getWidth());
    var H = Math.round(canvas.getHeight());
    var vpt = canvas.viewportTransform;
    var bg = canvas.backgroundImage;
    var imgEl = bg.getElement();

    // 1) reproduce exactly what's visible (image only, no markers), at size W x H
    var view = document.createElement('canvas');
    view.width = W; view.height = H;
    var vctx = view.getContext('2d');
    vctx.fillStyle = '#000'; vctx.fillRect(0, 0, W, H);
    vctx.setTransform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5]);
    vctx.drawImage(imgEl, bg.left, bg.top,
                   (imgEl.naturalWidth || imgEl.width) * bg.scaleX,
                   (imgEl.naturalHeight || imgEl.height) * bg.scaleY);
    vctx.setTransform(1, 0, 0, 1, 0, 0);

    // 2) letterbox the visible view into 256 x 256
    var scale = IMG_SIZE / Math.max(W, H);
    var nw = Math.round(W * scale), nh = Math.round(H * scale);
    var left = Math.floor((IMG_SIZE - nw) / 2), top = Math.floor((IMG_SIZE - nh) / 2);
    var off = document.createElement('canvas');
    off.width = IMG_SIZE; off.height = IMG_SIZE;
    var ctx = off.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, IMG_SIZE, IMG_SIZE);
    ctx.drawImage(view, 0, 0, W, H, left, top, nw, nh);
    var data = ctx.getImageData(0, 0, IMG_SIZE, IMG_SIZE).data;

    var chw = new Float32Array(3 * IMG_SIZE * IMG_SIZE);
    var plane = IMG_SIZE * IMG_SIZE;
    for (var i = 0; i < plane; i++) {
      var r = data[i * 4] / 255, g = data[i * 4 + 1] / 255, b = data[i * 4 + 2] / 255;
      chw[i] = (r - MEAN[0]) / STD[0];
      chw[plane + i] = (g - MEAN[1]) / STD[1];
      chw[2 * plane + i] = (b - MEAN[2]) / STD[2];
    }
    return {
      tensor: new ort.Tensor('float32', chw, [1, 3, IMG_SIZE, IMG_SIZE]),
      view: { W: W, H: H, scale: scale, left: left, top: top, vpt: vpt.slice() }
    };
  }

  // ---- decode 5 heatmaps: argmax + sub-pixel centroid -> normalized [0,1] ----
  function decodeHeatmaps(flat) {
    var pts = [];
    var area = HM_SIZE * HM_SIZE;
    for (var k = 0; k < 5; k++) {
      var base = k * area, best = -1e9, bx = 0, by = 0;
      for (var y = 0; y < HM_SIZE; y++) {
        for (var x = 0; x < HM_SIZE; x++) {
          var v = flat[base + y * HM_SIZE + x];
          if (v > best) { best = v; bx = x; by = y; }
        }
      }
      // weighted centroid in a small window around the peak
      var sw = 0, sx = 0, sy = 0, win = 2;
      for (var yy = Math.max(0, by - win); yy <= Math.min(HM_SIZE - 1, by + win); yy++) {
        for (var xx = Math.max(0, bx - win); xx <= Math.min(HM_SIZE - 1, bx + win); xx++) {
          var w = Math.max(0, flat[base + yy * HM_SIZE + xx]);
          sw += w; sx += w * xx; sy += w * yy;
        }
      }
      var cx = sw > 1e-6 ? sx / sw : bx, cy = sw > 1e-6 ? sy / sw : by;
      pts.push([cx / (HM_SIZE - 1), cy / (HM_SIZE - 1)]);  // normalized letterbox
    }
    return pts;
  }

  // ---- place the detected points into the existing marking flow ----
  // Map model output (256-normalized, in the rendered viewport) back to scene coords:
  // 256-normalized -> letterbox px -> viewport (screen) px -> scene via inverse viewport.
  function placeDetectedPoints(pts, view) {
    if (typeof resetMarkings === 'function') resetMarkings();
    var inv = fabric.util.invertTransform(view.vpt);
    pts.forEach(function (p) {
      var vx = (p[0] * IMG_SIZE - view.left) / view.scale;
      var vy = (p[1] * IMG_SIZE - view.top) / view.scale;
      var scenePt = fabric.util.transformPoint(new fabric.Point(vx, vy), inv);
      if (typeof placePoint === 'function') placePoint(scenePt.x, scenePt.y);
    });
    canvas.requestRenderAll && canvas.requestRenderAll();
  }

  function settingFromPlacedPoints() {
    if (typeof points === 'undefined' || points.length < 5) return null;
    var p = points.map(function (pt) { return pt.circle; });
    var ax = p[1].left - p[0].left, ay = p[1].top - p[0].top;
    var sx = p[4].left - p[3].left, sy = p[4].top - p[3].top;
    var ang = Math.atan2(sy, sx) - Math.atan2(-ay, -ax);
    ang = (ang * 180 / Math.PI + 360) % 360;
    return (typeof determineValveSetting === 'function') ? determineValveSetting(ang) : null;
  }

  // ---- result / status display ----
  function showResult(modelSetting, pointsSetting, theta) {
    var agree = modelSetting != null && modelSetting === pointsSetting;
    var settingTxt = (modelSetting === 'Unknown' || modelSetting == null)
      ? 'inconclusive' : ('Setting ' + modelSetting);
    var agreeTxt = agree
      ? '✓ point-derived reading matches'
      : '⚠ points and angle disagree — review carefully';
    var msg = 'AI estimate: ' + settingTxt + ' (angle ' + theta.toFixed(0) + '°). ' + agreeTxt +
      '. Experimental — verify manually before any clinical use.';
    status(msg, agree ? 'ok' : 'warn');

    // also surface in the existing instructions area for desktop
    var instr = document.getElementById('instructions');
    if (instr) instr.textContent = msg;
    document.dispatchEvent(new CustomEvent('autodetect:done',
      { detail: { modelSetting: modelSetting, pointsSetting: pointsSetting, theta: theta } }));
  }

  function status(msg, kind) {
    var el = document.getElementById('autoDetectStatus');
    if (el) {
      el.textContent = msg;
      el.className = 'autodetect-status ' + (kind || 'info');
      el.style.display = 'block';
    }
    // mobile: reuse the toast if present
    if (kind === 'warn' || kind === 'ok') {
      var toast = document.getElementById('mToast');
      if (toast && window.matchMedia('(max-width: 767.98px)').matches) {
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(function () { toast.classList.remove('show'); }, 8000);
      }
    }
  }
})();
