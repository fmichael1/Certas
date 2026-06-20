/* ============================================================
   dataset.js — collects each analyzed X-ray as labelled training data and
   POSTs it to save_sample.php (stored in a protected folder on this host).

   Captures the high-value signal: the model's auto-detected points (snapshotted
   right after auto-detect) vs the user's final/corrected points, the setting,
   and provenance. Retraining on this data is a separate offline step.

   Reuses app.js globals: canvas, points, pointLabels.
   ============================================================ */
(function () {
  'use strict';

  var ENDPOINT = 'save_sample.php';
  // Token comes from secret.js (gitignored, loaded before this script). A client
  // token is never truly secret, but keeping it out of the public repo avoids
  // GitHub-scanner abuse; the server fails closed if it isn't configured.
  var SAVE_TOKEN = window.CERTAS_SAVE_TOKEN || '';
  var APP_VERSION = '20260620g';
  // training component names, in the app's point order (proximal, distal, RHS, bar, t_bar)
  var COMPONENTS = ['proximal_connector', 'distal_connector', 'right_side_marker',
                    'indicator_bar', 'indicator_t_bar'];

  var usedAutoDetect = false;
  var autoSnapshot = null;     // {component: [x,y]} in original-image px

  document.addEventListener('DOMContentLoaded', function () {
    document.addEventListener('image:loaded', function () {
      usedAutoDetect = false; autoSnapshot = null;
    });
    // snapshot the model's guess right after auto-detect (before any correction)
    document.addEventListener('autodetect:done', function () {
      usedAutoDetect = true;
      autoSnapshot = collectPoints();
    });
    // save the sample once analysis runs
    document.addEventListener('analysis:complete', function (e) {
      saveSample(e.detail || {});
    });
  });

  // scene (fabric) coords of a marker -> original image pixels
  function toOriginal(circle) {
    var bg = canvas.backgroundImage;
    return [(circle.left - bg.left) / bg.scaleX, (circle.top - bg.top) / bg.scaleY];
  }

  function collectPoints() {
    if (typeof points === 'undefined' || points.length < 5) return null;
    var out = {};
    for (var i = 0; i < 5; i++) out[COMPONENTS[i]] = toOriginal(points[i].circle);
    return out;
  }

  var MAX_DIM = 1600;   // cap longest side; keeps uploads well under host limits
  var JPEG_Q = 0.9;

  // Downscaled JPEG of the current X-ray. A full-res PNG re-encode inflates the
  // file past typical PHP upload_max_filesize (the "upload error"); a capped JPEG
  // is small and is ample for 256px training + re-annotation. Returns the scale
  // factor so the stored point coords can be scaled to match the stored image.
  function imageBlob() {
    return new Promise(function (resolve) {
      var el = canvas.backgroundImage && canvas.backgroundImage.getElement();
      if (!el) { resolve(null); return; }
      var ow = el.naturalWidth || el.width, oh = el.naturalHeight || el.height;
      var scale = Math.min(1, MAX_DIM / Math.max(ow, oh));
      var w = Math.round(ow * scale), h = Math.round(oh * scale);
      var off = document.createElement('canvas');
      off.width = w; off.height = h;
      var ctx = off.getContext('2d');
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);   // flatten alpha for JPEG
      ctx.drawImage(el, 0, 0, w, h);
      off.toBlob(function (b) {
        resolve({ blob: b, scale: scale, w: w, h: h, ow: ow, oh: oh });
      }, 'image/jpeg', JPEG_Q);
    });
  }

  // scale a {component:[x,y]} map of original-px points to the stored image's px
  function scalePoints(pts, s) {
    if (!pts) return null;
    var out = {};
    COMPONENTS.forEach(function (c) {
      if (pts[c]) out[c] = [pts[c][0] * s, pts[c][1] * s];
    });
    return out;
  }

  function pointsEqual(a, b) {
    if (!a || !b) return false;
    return COMPONENTS.every(function (c) {
      return a[c] && b[c] && Math.abs(a[c][0] - b[c][0]) < 0.5 && Math.abs(a[c][1] - b[c][1]) < 0.5;
    });
  }

  async function saveSample(detail) {
    if (!canvas || !canvas.backgroundImage) return;
    var finalPoints = collectPoints();
    if (!finalPoints) return;

    var img = await imageBlob();
    if (!img || !img.blob) return;

    // points are collected in ORIGINAL px; scale them to the stored (downscaled) image
    var corrected = usedAutoDetect && !pointsEqual(autoSnapshot, finalPoints);
    var meta = {
      width: img.w,
      height: img.h,
      orig_width: img.ow,
      orig_height: img.oh,
      setting: (detail.setting != null) ? detail.setting : null,
      angle: (detail.angle != null) ? Math.round(detail.angle * 100) / 100 : null,
      source: usedAutoDetect ? 'autodetect' : 'manual',
      corrected: corrected,
      final_points: scalePoints(finalPoints, img.scale),
      auto_points: usedAutoDetect ? scalePoints(autoSnapshot, img.scale) : null,
      app_version: APP_VERSION
    };

    var fd = new FormData();
    fd.append('token', SAVE_TOKEN);
    fd.append('meta', JSON.stringify(meta));
    fd.append('image', img.blob, 'xray.jpg');

    try {
      var resp = await fetch(ENDPOINT, { method: 'POST', body: fd });
      var j = await resp.json();
      if (j && j.ok) {
        note('✓ Saved to dataset' + (corrected ? ' (with your correction)' : ''), 'ok');
        document.dispatchEvent(new CustomEvent('dataset:saved', { detail: { id: j.id, corrected: corrected } }));
      } else {
        note('Dataset save failed: ' + ((j && j.error) || 'unknown'), 'warn');
      }
    } catch (err) {
      note('Dataset save skipped (offline).', 'warn');
    }
  }

  // reuse the auto-detect status banner / mobile toast for feedback
  function note(msg, kind) {
    var el = document.getElementById('autoDetectStatus');
    if (el) {
      var prev = el.textContent;
      el.textContent = (prev && prev.indexOf('AI estimate') === 0 ? prev + '  ' : '') + msg;
      el.className = 'autodetect-status ' + (kind || 'info');
      el.style.display = 'block';
    }
    var toast = document.getElementById('mToast');
    if (toast && window.matchMedia('(max-width: 767.98px)').matches) {
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(function () { toast.classList.remove('show'); }, 5000);
    }
  }
})();
