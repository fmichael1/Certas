# Correction + dataset-collection loop — design

**Date:** 2026-06-20
**Status:** Approved, implementing

## Goal

Let users correct the auto-detected (or manual) marker points by dragging, and
store each analyzed X-ray + its final points centrally on this host as labelled
training data, so the model can be retrained to overcome the 43-valve data
ceiling. The operator (user) controls the data and handles de-identification /
consent externally — no consent UI in scope.

## Components

### 1. Editable points (`app.js`)
- Markers become draggable (`selectable/evented: true`, no rotate/scale handles,
  move cursor). The text label and any analysis lines update/clear on drag.
- Click-to-place still only fires on empty canvas while < 5 points exist; clicking
  an existing point drags it (guard: skip placement when `event.target` is a marker).
- Mobile: `mobile.js` lets fabric handle a touch that lands on a marker (drag),
  instead of treating it as pan/loupe.

### 2. Collector (`dataset.js`, new)
- On `autodetect:done`: remember the auto-detected points (original-image px) and
  that auto-detect was used.
- On `analysis:complete`: build a sample and POST it once:
  - image (original resolution PNG, from `canvas.backgroundImage` element)
  - final 5 points in ORIGINAL image px (inverse of the fabric placement transform)
  - auto-detected points (if any) + `corrected` flag (final != auto)
  - setting, angle, provenance, image dims, timestamp, app version
- Shows a small "✓ saved to dataset" / failure note.

### 3. Server endpoint (`save_sample.php`, new)
- Token-gated (shared secret), accepts multipart: `image` + `meta` (JSON).
- Validates image type (PNG/JPEG) and size (≤ 15 MB); filenames generated
  server-side (no user input in paths).
- Writes to a protected store OUTSIDE the web root: `/home/fmichael1/certas_dataset/`
  - `images/<id>.png`
  - appends 5 rows to `annotations.csv` (`image_id,component_name,x,y`) — the exact
    training format, so it folds straight in
  - `records/<id>.json` — full record (auto vs corrected points, setting, provenance)
- Returns `{ok, id}`.

### 4. Offline retrain bridge (`merge_dataset.py`, in CertasV2/ml)
- Folds `certas_dataset/` images + annotations into the training set (dedup by id),
  so a periodic offline retrain + ONNX re-export picks up the new corrections.
  Retraining is NOT in-browser.

## Data format (per sample)

`annotations.csv` rows (training-compatible):
```
<id>.png,proximal_connector,x,y
<id>.png,distal_connector,x,y
... (5 rows, original-image pixels)
```
`records/<id>.json`: `{id, ts, image, w, h, setting, angle, source, corrected,
final_points:{component:[x,y]}, auto_points:{...}|null, app_version}`

## Security / safety
- Endpoint gated by a shared token; image type + size limits; generated filenames;
  store outside web root (not web-servable). Operator can rotate the token.
- Additive only — the manual analysis workflow is unchanged.

## Testing
Chrome (desktop + mobile emulation): drag a marker and confirm it moves + updates;
run Analyze and confirm a sample POSTs and lands in `certas_dataset/` (image +
annotations.csv rows + record JSON); confirm token rejection and graceful failure
when the endpoint is unreachable.
