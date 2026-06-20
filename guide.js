/* ============================================================
   guide.js — Valve reference diagram.

   Loads certas.svg into the desktop sidebar panel (#guidePanel) and the
   mobile canvas inset (#guideInset). The five markable components are
   defaulted to black; the component for the CURRENT marking step is
   highlighted red, so the user can see what/where they're marking.

   Component mapping (pointLabels index -> certas.svg element id):
     0 Proximal connector       -> circle20-6  (top connector dot)
     1 Distal connector         -> circle20-3  (bottom connector dot)
     2 RHS marker               -> circle20    (right-side dot)
     3 Setting indicator bar    -> rect715     (right bar, lower chamber)
     4 Setting indicator T bar  -> rect715-5   (left T-shape, lower chamber)
   ============================================================ */
(function () {
  'use strict';

  var GUIDE_MAP = ['circle20-6', 'circle20-3', 'circle20', 'rect715', 'rect715-5'];
  var containers = [];

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    ['guidePanel', 'guideInset'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) containers.push(el);
    });
    if (!containers.length) return;

    fetch('certas.svg?v=20260620d')
      .then(function (r) { return r.text(); })
      .then(function (svgText) {
        // Parse as SVG and import the node (avoids innerHTML); certas.svg is a
        // trusted first-party asset, but this is the cleaner, safer route.
        var parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml');
        var sourceSvg = parsed.documentElement;
        if (!sourceSvg || sourceSvg.nodeName.toLowerCase() !== 'svg') return;

        containers.forEach(function (c) {
          var svg = document.importNode(sourceSvg, true);
          svg.removeAttribute('width');
          svg.removeAttribute('height');
          svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
          svg.style.width = '100%';
          svg.style.height = '100%';
          svg.style.display = 'block';
          while (c.firstChild) c.removeChild(c.firstChild);
          c.appendChild(svg);
          // default every markable component to black
          GUIDE_MAP.forEach(function (id) {
            var el = svg.querySelector('#' + id);
            if (el) el.style.fill = '#000000';
          });
        });
        paint(activeStep());
        bind();
      })
      .catch(function () { /* guide is optional — ignore load failures */ });
  }

  // The step the user is currently being asked to mark, or null when not marking.
  function activeStep() {
    var total = (typeof pointLabels !== 'undefined') ? pointLabels.length : 5;
    var idx = (typeof currentPointIndex !== 'undefined') ? currentPointIndex : 0;
    var hasImg = !!(typeof canvas !== 'undefined' && canvas && canvas.backgroundImage);
    if (!hasImg || idx >= total) return null;
    return idx;
  }

  function paint(step) {
    var show = step !== null && step >= 0;
    containers.forEach(function (c) {
      c.classList.toggle('show', show);
      GUIDE_MAP.forEach(function (id, i) {
        var el = c.querySelector('#' + id);
        if (el) el.style.fill = (i === step) ? '#ff0000' : '#000000';
      });
    });
  }

  function bind() {
    document.addEventListener('image:loaded', function () { paint(activeStep()); });
    document.addEventListener('points:changed', function () { paint(activeStep()); });
    document.addEventListener('analysis:complete', function () { paint(null); });
    document.addEventListener('image:error', function () { paint(null); });
  }
})();
