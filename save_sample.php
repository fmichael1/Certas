<?php
/* ============================================================
   save_sample.php — receives an analyzed X-ray + its 5 marker points and
   stores it as labelled training data in a PROTECTED store outside the web root.

   Token-gated, validates image type/size, generates its own filenames. Writes:
     <STORE>/images/<id>.png
     <STORE>/annotations.csv     (training format: image_id,component_name,x,y)
     <STORE>/records/<id>.json   (full record incl. auto vs corrected points)

   SET YOUR OWN TOKEN below and mirror it in dataset.js.
   ============================================================ */

header('Content-Type: application/json');

// ---- config ----
// Token lives in secret.php (gitignored, NOT in the public repo). Fail closed if
// it's missing or empty so a fresh deploy can't be spammed with an empty token.
@include __DIR__ . '/secret.php';
const STORE = '/home/fmichael1/certas_dataset';
const MAX_BYTES = 15 * 1024 * 1024;
$COMPONENTS = ['proximal_connector', 'distal_connector', 'right_side_marker',
               'indicator_bar', 'indicator_t_bar'];

function fail($code, $msg) {
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $msg]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail(405, 'POST only');
if (!defined('SAVE_TOKEN') || SAVE_TOKEN === '') fail(503, 'endpoint not configured');
if (($_POST['token'] ?? '') !== SAVE_TOKEN) fail(403, 'bad token');
if (!isset($_FILES['image'])) fail(400, 'no image');
if ($_FILES['image']['error'] !== UPLOAD_ERR_OK) fail(400, 'upload error');
if ($_FILES['image']['size'] > MAX_BYTES) fail(413, 'image too large');

// validate it's really an image (png/jpeg)
$info = @getimagesize($_FILES['image']['tmp_name']);
if ($info === false || !in_array($info[2], [IMAGETYPE_PNG, IMAGETYPE_JPEG], true)) {
    fail(415, 'not a png/jpeg');
}

$meta = json_decode($_POST['meta'] ?? '{}', true);
if (!is_array($meta)) fail(400, 'bad meta');
$points = $meta['final_points'] ?? [];
foreach ($COMPONENTS as $c) {
    if (!isset($points[$c]) || count($points[$c]) !== 2) fail(400, "missing point: $c");
}

// generated id + extension matching the actual image type — no user input in the path
$id = date('Ymd_His') . '_' . bin2hex(random_bytes(4));
$ext = ($info[2] === IMAGETYPE_PNG) ? 'png' : 'jpg';
$imgName = $id . '.' . $ext;

@mkdir(STORE . '/images', 0700, true);
@mkdir(STORE . '/records', 0700, true);

$imgPath = STORE . '/images/' . $imgName;
if (!move_uploaded_file($_FILES['image']['tmp_name'], $imgPath)) fail(500, 'save failed');
@chmod($imgPath, 0600);

// append the 5 annotation rows (training-compatible)
$csv = STORE . '/annotations.csv';
// ftell() is unreliable right after fopen('a'), so decide on the header up front.
$needHeader = !file_exists($csv) || filesize($csv) === 0;
$fh = fopen($csv, 'a');
if ($fh) {
    if (flock($fh, LOCK_EX)) {
        if ($needHeader) fwrite($fh, "image_id,component_name,x,y\n");
        foreach ($COMPONENTS as $c) {
            $p = $points[$c];
            fwrite($fh, sprintf("%s,%s,%.2f,%.2f\n", $imgName, $c, $p[0], $p[1]));
        }
        flock($fh, LOCK_UN);
    }
    fclose($fh);
}

// full record (the rich signal: model guess vs correction, provenance)
$record = [
    'id' => $id,
    'ts' => date('c'),
    'image' => $imgName,
    'width' => $meta['width'] ?? $info[0],
    'height' => $meta['height'] ?? $info[1],
    'setting' => $meta['setting'] ?? null,
    'angle' => $meta['angle'] ?? null,
    'source' => $meta['source'] ?? 'manual',
    'corrected' => $meta['corrected'] ?? false,
    'final_points' => $points,
    'auto_points' => $meta['auto_points'] ?? null,
    'app_version' => $meta['app_version'] ?? null,
];
file_put_contents(STORE . '/records/' . $id . '.json', json_encode($record, JSON_PRETTY_PRINT));

echo json_encode(['ok' => true, 'id' => $id]);
