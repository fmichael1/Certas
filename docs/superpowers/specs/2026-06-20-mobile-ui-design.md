# Certas X-ray Analyzer — Mobile UI Design

**Date:** 2026-06-20
**Status:** Approved, implementing

## Goal

Make the Certas VPS Valve X-ray Analyzer genuinely usable on a **phone**. The core
task — dropping 5 precise points on a valve in an X-ray with a fingertip — must work
well on a small touch screen. Desktop (≥768px) stays exactly as it is today.

## Decisions (from brainstorming)

1. **Target:** Phone-first.
2. **Scope:** Layout + touch gestures + a precise-placement aid.
3. **Precise placement:** **Magnifier loupe** — touch shows a zoomed crosshair circle
   above the fingertip; lift to drop.
4. **Layout:** **Canvas-dominant** (X-ray fills the screen, slim top bar, fixed bottom
   toolbar, pull-up sheet) **with wizard step-guidance folded in** (progress + "Mark
   the…" prompt).
5. **Gesture model:** One finger = place the current point (loupe). Two fingers =
   pinch-zoom + pan. No mode toggle.
6. **CSS cleanup:** De-duplicate the app's own styles in `styles.css` (currently
   present twice). Desktop appearance must not change.

## Architecture

Desktop is untouched. All mobile behavior is gated behind a `<768px` breakpoint
(CSS) and `matchMedia` (JS), so the existing experience carries zero risk.

| File | Change |
|------|--------|
| `mobile.css` (new) | All phone styles. Loaded **last** so it wins without editing the messy `styles.css`. Hides desktop chrome <768px, lays out canvas-dominant view, styles top bar / toolbar / sheet / loupe. |
| `mobile.js` (new) | Touch gestures (1-finger loupe placement, 2-finger pinch/pan), loupe rendering, bottom-sheet toggle, wizard step state, responsive canvas resize. Operates on the Fabric `canvas` global and the events app.js dispatches. |
| `app.js` | Small refactor: extract `placePoint(x, y)` shared by mouse + touch. Dispatch decoupled DOM events (`image:loaded`, `points:changed`, `analysis:complete`). Ignore touch-origin events in the mouse handler (mobile.js owns touch). No behavior change on desktop. |
| `index.html` | Add mobile-only chrome (top step bar, bottom toolbar, pull-up sheet, loupe overlay). Link `mobile.css` and `mobile.js`. |
| `styles.css` | De-duplicate the repeated app-style block (cleanup). |

### Decoupling: app.js → mobile.js

app.js stays unaware of the mobile UI. It only **dispatches events**:

- `image:loaded` — after an X-ray is placed on the canvas.
- `points:changed` `{count, index, total}` — on place / undo / reset.
- `analysis:complete` `{message}` — after `analyzeImage` runs.

mobile.js listens and updates the step text, the 5-segment progress bar, and the
context-aware primary button.

### Gesture model (mobile.js)

- **1 touch, while points remain:** show loupe at `(touch − above)`, magnify the
  region under the finger ~2.5× from `canvas.lowerCanvasEl` with a crosshair; on
  `touchend`, convert the touch point through the canvas viewport transform to scene
  coordinates and call `placePoint(x, y)`.
- **1 touch, all points placed:** one-finger pan.
- **2 touches:** pinch → `zoomToPoint`; midpoint delta → `relativePan`.
- `touch-action: none` on the canvas to suppress native browser gestures.
- Fabric's touch→mouse mapping is neutralized by an early-return guard in
  `handleCanvasMouseDown` so a touch never double-places.

### Bottom toolbar (context-aware primary)

`Upload · Flip · Undo · [Primary] · More`. Primary button:
- while marking → disabled (shows progress),
- 5 points placed → green **Analyze** → runs `analyzeImage()`,
- after analysis → **Download** → runs `downloadAnalysis()`.

Pull-up **sheet** holds the less-frequent controls: rotation slider, flip, reset,
download, and the three reference-guide PDFs.

### Responsive canvas

Re-fit the Fabric canvas to its container on `resize` / `orientationchange`
(re-running `fitImageToCanvas` on the current background), so rotating the phone
doesn't break the view. Today it sizes once at load.

## What stays the same

- Desktop layout (≥768px).
- Analysis math: `analyzeImage`, `determineValveSetting`, the angle→setting table.
- PNG export via html2canvas.

## Verification

Load under Chrome DevTools mobile emulation (iPhone): screenshot the canvas-dominant
layout, walk the 5-point flow, confirm Analyze/Download wiring, and confirm desktop
is unchanged at ≥768px. Flag any gesture behavior that needs a real-device check.
