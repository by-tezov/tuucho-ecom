<?php
declare(strict_types=1);

header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('X-Robots-Tag: noindex, nofollow');

$idToken = isset($_POST['id_token']) && is_string($_POST['id_token'])
    ? trim($_POST['id_token'])
    : '';
$state = isset($_POST['state']) && is_string($_POST['state'])
    ? trim($_POST['state'])
    : '';
$error = isset($_POST['error']) && is_string($_POST['error'])
    ? trim($_POST['error'])
    : '';

$payload = json_encode(
    [
        'idToken' => $idToken !== '' ? $idToken : null,
        'state' => $state !== '' ? $state : null,
        'error' => $error !== '' ? $error : null,
    ],
    JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_INVALID_UTF8_SUBSTITUTE,
);
if ($payload === false) {
    $payload = '{"idToken":null,"state":null,"error":"invalid_callback"}';
}
?>
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="robots" content="noindex, nofollow">
    <title>Returning to Shop…</title>
  </head>
  <body>
    <p>Returning to Shop…</p>
    <script>
      (() => {
        const payload = <?= $payload ?>;
        try {
          sessionStorage.setItem('psn-apple-oauth-return-bridge-v1', JSON.stringify(payload));
        } catch (_) {
          // The React callback will return to the originating page.
        }
        // Keep any deploy-only prefix (preprod) while switching the POST to a
        // normal GET that the SPA router can render.
        window.location.replace(window.location.pathname);
      })();
    </script>
  </body>
</html>
