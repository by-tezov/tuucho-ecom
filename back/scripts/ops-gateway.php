<?php
declare(strict_types=1);

// Independent FTP bootstrap gateway. It deliberately runs under PHP/Apache,
// not the Node Passenger application that it repairs — so it stays reachable
// while that application is stopped, mid-release-swap, or failing to boot.
//
// Everything below exists to make `exec()` behave like `ssh host '<command>'`,
// because every command deploy.ts sends was written for SSH. Two differences
// bite hard and silently:
//   * SSH starts in $HOME; a CGI process starts in this document root, so a
//     relative path like `private_html/preprod/current` resolves *inside the
//     public web root* and builds a phantom mirror tree instead of failing.
//   * SSH exports HOME; Apache does not, so `"$HOME"/nodevenv/...` expands to
//     `/nodevenv/...` and every such command is a no-op that still exits 0.

ignore_user_abort(true);
set_time_limit(0);

const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
// The loopback server loads the whole application (express, stripe, pg, every
// route module), which is a couple of seconds warm and slower on a cold FS.
const OPS_READY_TIMEOUT_SECONDS = 120;
// A loopback opsServer that is still importing its routers holds the port
// open without answering /healthz. Killing it at the ready timeout made every
// retry start from a cold filesystem again, so a slow host could never
// converge; instead the process is kept until this much older budget runs
// out, and the caller retries onto the same warming process.
const OPS_COLD_START_BUDGET_SECONDS = 600;
// opsServer binds its port before loading any route, so a recorded server
// that still holds no port this long after its spawn is dead (the host kills
// idle or over-limit processes with SIGKILL), not warming up.
const OPS_BIND_GRACE_SECONDS = 30;
// A catalogue import can legitimately run long; this only bounds a single
// proxied request, not the server's lifetime.
const OPS_PROXY_TIMEOUT_SECONDS = 600;

function respond(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

/** The account home, as SSH would land in it. getenv() is empty under Apache
 * on this host, so fall back to the passwd entry and finally to this script's
 * own location (`/home/<user>/public_html/<gateway>`). */
/** The path and query the caller actually asked for.
 *
 * REQUEST_URI is not trustworthy here: this host serves PHP through LiteSpeed,
 * which rewrites it to the target script, so a request for /operation/x
 * arrives looking like /index.php. The .htaccess therefore passes the original
 * path in __ops_path; the other sources are fallbacks for a plain-Apache vhost
 * or a direct call that skipped the rewrite. */
function requestTarget(): string
{
    $path = null;
    if (isset($_GET['__ops_path']) && is_string($_GET['__ops_path']) && $_GET['__ops_path'] !== '') {
        $path = $_GET['__ops_path'];
    }
    if ($path === null) {
        foreach (['REDIRECT_URL', 'SCRIPT_URL', 'REQUEST_URI'] as $key) {
            $raw = $_SERVER[$key] ?? null;
            if (is_string($raw) && $raw !== '' && !str_contains($raw, 'index.php')) {
                $path = (string) (parse_url($raw, PHP_URL_PATH) ?: '/');
                break;
            }
        }
    }
    if ($path === null || $path === '') {
        $path = '/';
    }
    if ($path[0] !== '/') {
        $path = '/' . $path;
    }
    $query = $_GET;
    unset($query['__ops_path']);
    $queryString = http_build_query($query);
    return $path . ($queryString !== '' ? '?' . $queryString : '');
}

function accountHome(): string
{
    $candidates = [];
    $fromEnv = getenv('HOME');
    if (is_string($fromEnv) && $fromEnv !== '') {
        $candidates[] = $fromEnv;
    }
    if (function_exists('posix_geteuid') && function_exists('posix_getpwuid')) {
        $entry = posix_getpwuid(posix_geteuid());
        if (is_array($entry) && isset($entry['dir']) && is_string($entry['dir'])) {
            $candidates[] = $entry['dir'];
        }
    }
    if (preg_match('#^(/home/[^/]+)(?:/|$)#', __DIR__, $matches) === 1) {
        $candidates[] = $matches[1];
    }
    foreach ($candidates as $candidate) {
        if (is_dir($candidate)) {
            return rtrim($candidate, '/');
        }
    }
    return '';
}

/** preprod vs prod comes from this gateway's own document root, not from the
 * Host header: the directory is what the deploy actually uploaded to, and it
 * cannot be influenced by the caller. */
function gatewayMode(): string
{
    return basename(__DIR__) === 'ops-preprod' ? 'preprod' : 'prod';
}

/** OPS_TOKEN out of the deployed release's private env. `current` is the
 * normal source; the versioned releases are a fallback for the moment during
 * a release swap when the symlink is briefly absent. Parsed line-by-line
 * rather than with parse_ini_file(), which rejects the unquoted `#`, `$` and
 * `"` that real secrets contain and would fail the whole file. */
function readOpsToken(string $home, string $mode): string
{
    // Written by `npm run deploy -- --ftp-ops`. Preferred over the release's
    // env because it leaves the deployed application's configuration alone and
    // survives a release swap — so rotating OPS_TOKEN cannot lock this
    // transport out of the host it needs in order to publish the new value.
    $standalone = "$home/private_html/$mode/.ops-gateway/token";
    if (is_file($standalone) && is_readable($standalone)) {
        $value = trim((string) file_get_contents($standalone));
        if ($value !== '') {
            return $value;
        }
    }

    $candidates = ["$home/private_html/$mode/current/.env/$mode/.private.env"];
    $versioned = glob("$home/private_html/$mode/v*/.env/$mode/.private.env");
    if (is_array($versioned)) {
        rsort($versioned, SORT_NATURAL);
        $candidates = array_merge($candidates, $versioned);
    }
    foreach ($candidates as $file) {
        if (!is_file($file) || !is_readable($file)) {
            continue;
        }
        $lines = file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($lines === false) {
            continue;
        }
        foreach ($lines as $line) {
            if (preg_match('/^\s*OPS_TOKEN\s*=\s*(.*)$/', $line, $matches) !== 1) {
                continue;
            }
            $value = trim($matches[1]);
            if (strlen($value) >= 2 && ($value[0] === '"' || $value[0] === "'") && $value[-1] === $value[0]) {
                $value = substr($value, 1, -1);
            }
            if ($value !== '') {
                return $value;
            }
        }
    }
    return '';
}

/** Apache hands the Authorization header through as HTTP_AUTHORIZATION only
 * because of the SetEnvIf/rewrite in this gateway's .htaccess; keep the
 * apache_request_headers() fallback for setups where neither fires. */
function presentedAuthorization(): string
{
    $direct = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (is_string($direct) && $direct !== '') {
        return $direct;
    }
    if (function_exists('apache_request_headers')) {
        foreach (apache_request_headers() as $name => $value) {
            if (strcasecmp($name, 'Authorization') === 0 && is_string($value)) {
                return $value;
            }
        }
    }
    return '';
}

/** Runs one command the way SSH would: bash, from $HOME, with HOME exported.
 * `-l` is what puts cPanel's own PATH (cloudlinux-selector, the nodevenv
 * shims) in scope. stdout and stderr stay separate so a failing deploy step
 * reports a real error instead of an interleaved blob. */
function runCommand(string $command, string $home): array
{
    $stderrFile = tempnam(sys_get_temp_dir(), 'ops-gateway-');
    if ($stderrFile === false) {
        return ['stdout' => '', 'stderr' => 'could not allocate a stderr buffer', 'exitCode' => 127];
    }
    $descriptors = [
        0 => ['file', '/dev/null', 'r'],
        1 => ['pipe', 'w'],
        2 => ['file', $stderrFile, 'w'],
    ];
    $environment = ['HOME' => $home, 'PATH' => getenv('PATH') ?: '/usr/local/bin:/usr/bin:/bin', 'SHELL' => '/bin/bash'];
    $bash = is_executable('/bin/bash') ? '/bin/bash' : '/usr/bin/bash';
    $process = false;
    $pipes = [];
    // Array-form first (no extra shell). Retry: CloudLinux nproc can refuse a
    // spawn for a moment after a sharp/libvips photo import, then recover.
    for ($attempt = 0; $attempt < 3 && !is_resource($process); $attempt++) {
        if ($attempt > 0) {
            usleep(250000 * $attempt);
        }
        $process = @proc_open([$bash, '-lc', $command], $descriptors, $pipes, $home, $environment);
    }
    if (!is_resource($process)) {
        $process = @proc_open(
            $bash . ' -lc ' . escapeshellarg($command),
            $descriptors,
            $pipes,
            $home,
            $environment,
        );
    }
    if (is_resource($process)) {
        // stderr goes to a file rather than a second pipe on purpose: draining two
        // pipes from one thread deadlocks as soon as either side fills its buffer,
        // and `npm install` produces enough of both to hit that.
        $stdout = (string) stream_get_contents($pipes[1]);
        fclose($pipes[1]);
        $exitCode = proc_close($process);
        $stderr = (string) @file_get_contents($stderrFile);
        @unlink($stderrFile);
        return [
            'stdout' => truncateOutput($stdout),
            'stderr' => truncateOutput($stderr),
            'exitCode' => $exitCode,
        ];
    }

    $previousDir = getcwd();
    if ($previousDir === false || !@chdir($home)) {
        @unlink($stderrFile);
        return ['stdout' => '', 'stderr' => 'could not start /bin/bash', 'exitCode' => 127];
    }
    putenv("HOME=$home");
    putenv('SHELL=' . $bash);
    $lines = [];
    $exitCode = 1;
    exec($bash . ' -lc ' . escapeshellarg($command) . ' 2>' . escapeshellarg($stderrFile), $lines, $exitCode);
    @chdir($previousDir);
    $stderr = (string) @file_get_contents($stderrFile);
    @unlink($stderrFile);
    return [
        'stdout' => truncateOutput(implode("\n", $lines) . ($lines === [] ? '' : "\n")),
        'stderr' => truncateOutput($stderr),
        'exitCode' => $exitCode,
    ];
}

function truncateOutput(string $value): string
{
    return strlen($value) > MAX_OUTPUT_BYTES
        ? substr($value, 0, MAX_OUTPUT_BYTES) . "\n[ops-gateway] output truncated\n"
        : $value;
}

/** Where this gateway records the loopback server it started. Outside the web
 * root on purpose, and outside the versioned release directory so a deploy
 * swapping `current` does not take the state with it. */
function stateDir(string $home, string $mode): string
{
    $dir = "$home/private_html/$mode/.ops-gateway";
    if (!is_dir($dir)) {
        @mkdir($dir, 0700, true);
    }
    return $dir;
}

/** Something is bound to the port, even if it does not answer /healthz yet.
 * That is the difference between a server still loading and a dead one. */
function loopbackListening(int $port): bool
{
    $socket = @stream_socket_client("tcp://127.0.0.1:$port", $errno, $errstr, 2);
    if ($socket === false) {
        return false;
    }
    fclose($socket);
    return true;
}

function loopbackHealthy(int $port): bool
{
    $curl = curl_init("http://127.0.0.1:$port/healthz");
    curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_TIMEOUT => 8]);
    curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
    curl_close($curl);
    return $status === 200;
}

function waitUntilLoopbackHealthy(int $port, float $deadline): bool
{
    while (microtime(true) < $deadline) {
        if (loopbackHealthy($port)) {
            return true;
        }
        usleep(250000);
    }
    return false;
}

function bashBinary(): string
{
    return is_executable('/bin/bash') ? '/bin/bash' : '/usr/bin/bash';
}

/** Fire-and-forget shell. Do not use PHP exec() here: this host can refuse
 * exec() after a Passenger restart (nproc) while proc_open still works,
 * which is how /control/exec already runs. */
function spawnDetached(string $command): bool
{
    $bash = bashBinary();
    $descriptors = [
        0 => ['file', '/dev/null', 'r'],
        1 => ['file', '/dev/null', 'w'],
        2 => ['file', '/dev/null', 'w'],
    ];
    $pipes = [];
    $process = false;
    for ($attempt = 0; $attempt < 3 && !is_resource($process); $attempt++) {
        if ($attempt > 0) {
            usleep(250000 * $attempt);
        }
        $process = @proc_open([$bash, '-lc', $command], $descriptors, $pipes);
    }
    if (!is_resource($process)) {
        $process = @proc_open($bash . ' -lc ' . escapeshellarg($command), $descriptors, $pipes);
    }
    if (!is_resource($process)) {
        return false;
    }
    proc_close($process);
    return true;
}

function opsLogTail(string $logFile): string
{
    $log = @file_get_contents($logFile);
    return is_string($log) ? trim(substr($log, -1200)) : '';
}

function recordOpsPort(string $portFile, string $releaseFile, int $port, string $expectedRelease): void
{
    file_put_contents($portFile, (string) $port);
    @chmod($portFile, 0600);
    // mtime of the port file is the spawn time; the cold-start budget below
    // is measured from it.
    if ($expectedRelease !== '') {
        file_put_contents($releaseFile, $expectedRelease);
        @chmod($releaseFile, 0600);
    }
}

/** Ask the kernel for a free port by binding and immediately releasing one.
 * The same approach the SSH transport's tunnel helper uses. */
function allocatePort(): int
{
    $server = @stream_socket_server('tcp://127.0.0.1:0', $errno, $errstr);
    if ($server === false) {
        return 0;
    }
    $name = (string) stream_socket_get_name($server, false);
    fclose($server);
    $colon = strrpos($name, ':');
    return $colon === false ? 0 : (int) substr($name, $colon + 1);
}

function nodeBinary(string $home, string $mode): ?string
{
    foreach (glob("$home/nodevenv/private_html/$mode/current/*/bin/node") ?: [] as $candidate) {
        if (is_executable($candidate)) {
            return $candidate;
        }
    }
    return null;
}

function opsServerPath(string $home, string $mode): string
{
    return "$home/private_html/$mode/current/opsServer.js";
}

/** Resolved opsServer.js path for the live `current` release. After a deploy
 * swaps the symlink, a loopback server started from the previous release can
 * still answer /healthz — comparing this key prevents reusing stale code. */
function opsServerReleaseKey(string $home, string $mode): string
{
    $script = opsServerPath($home, $mode);
    if (!is_file($script) && !is_link($script)) {
        return '';
    }
    $resolved = realpath($script);
    return $resolved !== false ? $resolved : $script;
}

/** Starts (or reuses) the release's own loopback operations server — the very
 * same process the --ssh transport reaches through a port forward. Nothing
 * about the deployed application changes: this only runs a file that is
 * already in the release. */
function ensureOpsServer(string $home, string $mode): array
{
    $dir = stateDir($home, $mode);
    $portFile = "$dir/port";
    $releaseFile = "$dir/release";
    $expectedRelease = opsServerReleaseKey($home, $mode);
    $recorded = is_file($portFile) ? (int) trim((string) file_get_contents($portFile)) : 0;
    $knownRelease = is_file($releaseFile) ? trim((string) file_get_contents($releaseFile)) : '';
    $deadline = microtime(true) + OPS_READY_TIMEOUT_SECONDS;
    // A previous request may have spawned Node and then been cut off before
    // /healthz answered (LiteSpeed). Wait on that port instead of starting a
    // second process that the host then cannot spawn.
    if ($recorded > 0 && $knownRelease !== '' && $knownRelease === $expectedRelease) {
        $spawnedAt = @filemtime($portFile);
        $age = is_int($spawnedAt) ? time() - $spawnedAt : PHP_INT_MAX;
        if ($age < OPS_BIND_GRACE_SECONDS || loopbackListening($recorded)) {
            if (waitUntilLoopbackHealthy($recorded, $deadline)) {
                return [$recorded, null];
            }
            return [0, giveUpOrKeepStarting($home, $mode, $recorded, $portFile)];
        }
        // Killed since: forget it and start a fresh server below, instead of
        // waiting out the ready timeout and reporting that dead process's
        // old log as this request's failure.
        stopOpsServer($home, $mode);
        $recorded = 0;
    }
    if ($recorded > 0 && loopbackHealthy($recorded)) {
        stopOpsServer($home, $mode);
    }

    $node = nodeBinary($home, $mode);
    if ($node === null) {
        return [0, "no Node virtualenv under nodevenv/private_html/$mode/current"];
    }
    $script = opsServerPath($home, $mode);
    if (!is_file($script)) {
        return [0, "no opsServer.js in private_html/$mode/current"];
    }
    $port = allocatePort();
    if ($port <= 0) {
        return [0, 'could not allocate a loopback port'];
    }

    // setsid + nohup so the server outlives this request: Apache tears down the
    // request's process group as soon as the response is written, and a server
    // that died with it would be useless. setsid is optional: some jails omit it.
    //
    // The script is named by absolute path so its mode is visible in argv,
    // which is what /control/ops-stop matches on. cwd is the release so
    // relative paths match Passenger; env.ts also locates `.env` next to the
    // compiled tree if cwd is wrong.
    // HOME must be set: Apache leaves it empty, and Node code that builds
    // FTP/scp-relative paths (backup pathFromHome) relies on the account home.
    $logFile = "$dir/opsServer.log";
    $detach = is_executable('/usr/bin/setsid') ? 'setsid nohup' : 'nohup';
    $command = sprintf(
        '( cd %s && HOME=%s APP_TARGET=%s PAM_OPS_PORT=%d %s %s %s ) >> %s 2>&1 < /dev/null &',
        escapeshellarg(dirname($script)),
        escapeshellarg($home),
        escapeshellarg($mode),
        $port,
        $detach,
        escapeshellarg($node),
        escapeshellarg($script),
        escapeshellarg($logFile)
    );
    @file_put_contents($logFile, date('c') . " starting port=$port\n");
    if (!spawnDetached($command)) {
        file_put_contents($logFile, date('c') . " spawn failed\n", FILE_APPEND);
        return [0, 'could not spawn opsServer' . (opsLogTail($logFile) !== '' ? ': ' . opsLogTail($logFile) : '')];
    }
    file_put_contents($logFile, date('c') . " spawn issued\n", FILE_APPEND);
    // Record the port before /healthz answers so a cut-off wait can resume.
    recordOpsPort($portFile, $releaseFile, $port, $expectedRelease);

    $startDeadline = microtime(true) + OPS_READY_TIMEOUT_SECONDS;
    if (waitUntilLoopbackHealthy($port, $startDeadline)) {
        return [$port, null];
    }
    return [0, giveUpOrKeepStarting($home, $mode, $port, $portFile)];
}

/** Decides what a ready-timeout means. A process still holding the port
 * inside the cold-start budget is left alone so the caller's next request
 * resumes waiting on it; anything else is cleaned up and reported with the
 * log tail, which is what an operator needs to see. */
function giveUpOrKeepStarting(string $home, string $mode, int $port, string $portFile): string
{
    $dir = stateDir($home, $mode);
    $spawnedAt = @filemtime($portFile);
    $age = is_int($spawnedAt) ? time() - $spawnedAt : PHP_INT_MAX;
    if ($age < OPS_COLD_START_BUDGET_SECONDS && loopbackListening($port)) {
        return sprintf(
            'opsServer is still starting on port %d (%ds so far, up to %ds) — retry this request',
            $port,
            max($age, 0),
            OPS_COLD_START_BUDGET_SECONDS
        );
    }
    $tail = opsLogTail("$dir/opsServer.log");
    stopOpsServer($home, $mode);
    return 'opsServer did not become ready' . ($tail !== '' ? ": $tail" : '');
}

function stopOpsServer(string $home, string $mode): void
{
    $dir = stateDir($home, $mode);
    // Match any loopback opsServer for this mode (versioned path or `current`),
    // so a release swap cannot leave a stale process answering /healthz.
    spawnDetached(sprintf('pkill -f %s 2>/dev/null || true', escapeshellarg("{$home}/private_html/{$mode}/.*opsServer.js")));
    @unlink("$dir/port");
    @unlink("$dir/release");
}

function isMultipartFormData(string $contentType): bool
{
    return str_starts_with(strtolower($contentType), 'multipart/form-data');
}

/** The FTP clients send repeated photos as photos[] so PHP retains every file
 * and their order. Node's Multer route intentionally exposes the API as
 * `photos`, so turn that PHP-only spelling back into the established field
 * name when the gateway can forward a raw multipart body. */
function normalizeMultipartUploadFields(string $body): string
{
    $normalized = preg_replace(
        '/(Content-Disposition:\\s*form-data;\\s*name=")photos\\[\\](")/i',
        '${1}photos${2}',
        $body,
    );
    return is_string($normalized) ? $normalized : $body;
}

/** Add a text value to a reconstructed multipart body. Nested values keep PHP's ordinary
 * bracket notation; the catalogue importer currently sends only scalar
 * fields (`hashes`), but this keeps the proxy useful for future multipart
 * operations too. */
function addMultipartField(array &$parts, string $boundary, string $name, mixed $value): void
{
    if (is_array($value)) {
        foreach ($value as $key => $child) {
            addMultipartField($parts, $boundary, $name . '[' . $key . ']', $child);
        }
        return;
    }
    $safeName = str_replace(["\r", "\n", '"'], '', $name);
    $parts[] = "--$boundary\r\n";
    $parts[] = "Content-Disposition: form-data; name=\"$safeName\"\r\n\r\n";
    $parts[] = (string) $value;
    $parts[] = "\r\n";
}

/** Recreate an incoming PHP file field as parts with its original field name.
 * PHP parses multipart request bodies into $_FILES; its php://input stream
 * can then be empty or incomplete, so forwarding it made Multer reject FTP
 * photo imports with an opaque 500. */
function addMultipartUploads(array &$parts, string $boundary, string $field, array $upload): void
{
    $tmpNames = $upload['tmp_name'] ?? null;
    $names = $upload['name'] ?? null;
    $types = $upload['type'] ?? null;
    $errors = $upload['error'] ?? null;
    $tmpList = is_array($tmpNames) ? $tmpNames : [$tmpNames];

    foreach ($tmpList as $index => $tmpName) {
        $error = is_array($errors) ? ($errors[$index] ?? UPLOAD_ERR_NO_FILE) : $errors;
        if ($error !== UPLOAD_ERR_OK || !is_string($tmpName) || !is_file($tmpName)) {
            respond(400, ['success' => false, 'error' => ['code' => 'invalid_upload', 'message' => 'multipart upload could not be read']]);
        }
        $name = is_array($names) ? ($names[$index] ?? 'upload') : $names;
        $type = is_array($types) ? ($types[$index] ?? 'application/octet-stream') : $types;
        $contents = file_get_contents($tmpName);
        if ($contents === false) {
            respond(400, ['success' => false, 'error' => ['code' => 'invalid_upload', 'message' => 'multipart upload could not be read']]);
        }
        $safeField = str_replace(["\r", "\n", '"'], '', $field);
        $safeName = str_replace(["\r", "\n", '"'], '', is_string($name) && $name !== '' ? basename($name) : 'upload');
        $safeType = str_replace(["\r", "\n"], '', is_string($type) && $type !== '' ? $type : 'application/octet-stream');
        $parts[] = "--$boundary\r\n";
        $parts[] = "Content-Disposition: form-data; name=\"$safeField\"; filename=\"$safeName\"\r\n";
        $parts[] = "Content-Type: $safeType\r\n\r\n";
        $parts[] = $contents;
        $parts[] = "\r\n";
    }
}

/** Build a fresh multipart stream from the fields parsed by PHP. The proxy
 * already holds a request body in memory before this point, so this preserves
 * its existing memory model while giving Busboy a complete boundary-delimited
 * request. */
function rebuiltMultipartBody(): array
{
    $boundary = '----PamOpsGateway' . bin2hex(random_bytes(16));
    $parts = [];
    foreach ($_POST as $name => $value) {
        addMultipartField($parts, $boundary, (string) $name, $value);
    }
    foreach ($_FILES as $field => $upload) {
        if (is_array($upload)) {
            addMultipartUploads($parts, $boundary, (string) $field, $upload);
        }
    }
    $parts[] = "--$boundary--\r\n";
    return ["multipart/form-data; boundary=$boundary", implode('', $parts)];
}

/** Forwards one request to the loopback server and copies the answer back.
 * This is the FTP transport's equivalent of the SSH port forward. */
function proxyToOps(int $port, string $requestUri): void
{
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    $curl = curl_init("http://127.0.0.1:$port" . $requestUri);
    $headers = [];
    // Loopback opsServer also requires OPS_TOKEN; forward the already-checked
    // Authorization header so --ftp does not fail after the PHP gate.
    $authorization = presentedAuthorization();
    if ($authorization !== '') {
        $headers[] = "Authorization: $authorization";
    }
    $contentType = (string) ($_SERVER['CONTENT_TYPE'] ?? '');
    $multipart = isMultipartFormData($contentType);
    // cURL must generate a new multipart boundary when rebuilding PHP's
    // parsed $_POST/$_FILES body, so forwarding the original header there
    // would make the loopback server parse it with the wrong boundary.
    if ($contentType !== '' && !$multipart) {
        $headers[] = "Content-Type: $contentType";
    }
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => OPS_PROXY_TIMEOUT_SECONDS,
    ]);
    if ($method !== 'GET' && $method !== 'HEAD') {
        $rawBody = (string) file_get_contents('php://input');
        // Some hosts leave multipart bodies available verbatim. Normalize the
        // PHP-only `photos[]` spelling before sending that raw stream to the
        // Node/Multer endpoint, whose established field name is `photos`.
        if ($multipart && $rawBody !== '') {
            $headers[] = "Content-Type: $contentType";
            curl_setopt($curl, CURLOPT_HTTPHEADER, $headers);
            curl_setopt($curl, CURLOPT_POSTFIELDS, normalizeMultipartUploadFields($rawBody));
        // With normal PHP parsing, photos[] is retained as an ordered
        // `photos` array in $_FILES, so reconstruction preserves each file.
        } elseif ($multipart && ($_POST !== [] || $_FILES !== [])) {
            [$rebuiltContentType, $rebuiltBody] = rebuiltMultipartBody();
            $headers[] = "Content-Type: $rebuiltContentType";
            curl_setopt($curl, CURLOPT_HTTPHEADER, $headers);
            curl_setopt($curl, CURLOPT_POSTFIELDS, $rebuiltBody);
        } else {
            if ($multipart && $contentType !== '') {
                $headers[] = "Content-Type: $contentType";
                curl_setopt($curl, CURLOPT_HTTPHEADER, $headers);
            }
            curl_setopt($curl, CURLOPT_POSTFIELDS, $rawBody);
        }
    }
    $body = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $responseType = (string) curl_getinfo($curl, CURLINFO_CONTENT_TYPE);
    $error = curl_error($curl);
    curl_close($curl);

    if ($body === false || $status === 0) {
        respond(502, ['success' => false, 'error' => ['code' => 'ops_unavailable', 'message' => $error !== '' ? $error : 'no response from the loopback server']]);
    }
    http_response_code($status);
    header('Content-Type: ' . ($responseType !== '' ? $responseType : 'application/json'));
    header('Cache-Control: no-store');
    echo $body;
    exit;
}

$home = accountHome();
if ($home === '') {
    respond(500, ['success' => false, 'error' => ['code' => 'home_not_found']]);
}
$mode = gatewayMode();

$expected = readOpsToken($home, $mode);
if ($expected === '' || !hash_equals('Bearer ' . $expected, presentedAuthorization())) {
    respond(401, ['success' => false, 'error' => ['code' => 'unauthorized']]);
}

$target = requestTarget();
$path = (string) (parse_url($target, PHP_URL_PATH) ?: '/');
$path = rtrim($path, '/');
if ($path === '') {
    $path = '/';
}

if ($path === '/healthz') {
    // The digest is what lets a deploy tell whether the version it just
    // published is the one actually executing: this host's opcache keeps
    // serving the previous bytes of index.php for up to ~30s after the file
    // is replaced, so "the upload succeeded" is not the same as "the new
    // gateway is live".
    respond(200, [
        'ok' => true,
        'mode' => $mode,
        'gateway' => 'php',
        'php' => PHP_VERSION,
        'sha256' => hash_file('sha256', __FILE__) ?: '',
    ]);
}

// The ops CLIs' surface. Reaching it through here is what replaces the SSH
// port forward when SSH is unavailable; the routes themselves are served by
// the release's own opsServer.js, unchanged.
if (str_starts_with($path, '/operation/')) {
    [$opsPort, $opsError] = ensureOpsServer($home, $mode);
    if ($opsError !== null) {
        respond(502, ['success' => false, 'error' => ['code' => 'ops_unavailable', 'message' => $opsError]]);
    }
    proxyToOps($opsPort, $target);
}

if ($path === '/control/ops-start' && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    [$opsPort, $opsError] = ensureOpsServer($home, $mode);
    if ($opsError !== null) {
        respond(502, ['success' => false, 'error' => ['code' => 'ops_unavailable', 'message' => $opsError]]);
    }
    respond(200, ['success' => true, 'port' => $opsPort]);
}

if ($path === '/control/ops-stop' && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    stopOpsServer($home, $mode);
    respond(200, ['success' => true]);
}

if ($path !== '/control/exec' || ($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    // Echo the path back: when routing is the thing that is broken, "404" with
    // no indication of what the gateway thought it was asked for is useless.
    respond(404, ['success' => false, 'error' => ['code' => 'not_found', 'message' => "no route for $path"]]);
}

$raw = file_get_contents('php://input');
$body = is_string($raw) ? json_decode($raw, true) : null;
$command = is_array($body) ? ($body['command'] ?? null) : null;
if (!is_string($command) || trim($command) === '') {
    respond(400, ['success' => false, 'error' => ['code' => 'invalid_command']]);
}

$result = runCommand($command, $home);
respond($result['exitCode'] === 0 ? 200 : 500, [
    'success' => $result['exitCode'] === 0,
    'stdout' => $result['stdout'],
    'stderr' => $result['stderr'],
    'exitCode' => $result['exitCode'],
    'error' => $result['exitCode'] === 0
        ? null
        : ['code' => 'command_failed', 'message' => "command exited with status {$result['exitCode']}"],
]);
