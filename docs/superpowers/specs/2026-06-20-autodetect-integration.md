# Auto-detect (AI assist) — integration design

**Date:** 2026-06-20
**Status:** Delivered (experimental)

## Goal

Add an in-browser "Auto-detect" feature to the Certas X-ray analyzer: run the
trained valve model on an uploaded X-ray to auto-place the 5 marker points and
show a setting estimate, keeping the user in the loop.

## Architecture

Fully client-side. No backend; the app stays static-hostable.

| Piece | Detail |
|---|---|
| Runtime | `onnxruntime-web` (single-threaded WASM) from CDN |
| Model | `valve_model.onnx` (9.3 MB, self-contained) shipped as a static asset |
| Module | `autodetect.js` (new) — preprocess, infer, decode, place points, display |
| UI | "Auto-detect (experimental)" button: desktop sidebar + mobile sheet; status banner |

### Pipeline (autodetect.js)
1. Letterbox the canvas image to 256×256 + ImageNet-normalize (mirrors the
   Python training preprocessing exactly).
2. ONNX inference → `heatmaps [1,5,64,64]` + `sincos [1,2]`.
3. Decode 5 points (argmax + sub-pixel centroid) → un-letterbox → fabric scene
   coords → place via the existing `placePoint()`.
4. Setting estimate = `determineValveSetting(atan2(sin,cos))` (the reliable
   angle head). Cross-check against the setting derived from the placed points.
5. Display with an honest experimental label; the user can drag points and
   Analyze as usual.

### Key implementation notes
- The model is exported with RAW heatmaps (not soft-argmax) so the browser can
  decode points precisely.
- Single-threaded WASM (`ort.env.wasm.numThreads = 1`) avoids the
  SharedArrayBuffer / COOP-COEP requirement, so it runs on any static host.
- The ONNX must be a single self-contained file (weights embedded), not external
  `.onnx.data`, which the browser runtime can't mount.
- `canvas` is referenced by its lexical name (app.js `let canvas`), not
  `window.canvas` (top-level `let` is not a window property).

## ⚠️ Honest model status (critical)

Leak-free 5-fold cross-validation by valve: **24.4% setting accuracy**
(within-1-setting 56.1%). The earlier 87.2% was inflated by augmented-copy
leakage (the 279 images are augmentations of only **43 unique valves**).

**The model does not yet reliably generalize.** The feature is therefore shipped
as an **experimental aid only**, clearly labelled "verify manually before any
clinical use." The human-in-the-loop manual workflow is unchanged and remains the
source of truth.

## What would actually improve it
1. **More unique annotated valves** — especially settings 1, 2, 3, 5 (currently
   1–3 examples each; 1 and 2 absent). This is the dominant lever.
2. Retrain on all data once more valves exist; re-export and drop in.
3. Optional: int8-quantize the ONNX (~9 MB → ~2.5 MB) for faster first load.

## Testing
Verified in Chrome (desktop + mobile emulation): model loads from CDN,
auto-detect places 5 points on the valve, setting estimate + agreement indicator
display, graceful failure when the model can't load. (Verified on a training
image, so the correct result there is optimistic — see honest status above.)
