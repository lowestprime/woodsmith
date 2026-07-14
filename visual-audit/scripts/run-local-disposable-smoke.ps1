[CmdletBinding()]
param(
  [string]$AppImage = "woodsmith:local-gate",
  [string]$AuditImage = "woodsmith-visual-audit:local-gate",
  [string]$CommitSha = "",
  [ValidateSet("smoke", "full")]
  [string]$Scope = "smoke"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Invoke-Docker {
  param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
  )

  & docker @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Docker command failed with exit code $LASTEXITCODE."
  }
}

if ([string]::IsNullOrWhiteSpace($CommitSha)) {
  $CommitSha = (& git rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to resolve the current commit."
  }
}

if ($CommitSha -notmatch "^[0-9a-f]{40}$") {
  throw "CommitSha must be a full 40-character lowercase Git SHA."
}

$appMetadata = (Invoke-Docker image inspect $AppImage) | ConvertFrom-Json
$auditMetadata = (Invoke-Docker image inspect $AuditImage) | ConvertFrom-Json
$appBuildSha = $appMetadata[0].Config.Env |
  Where-Object { $_ -like "WOODSMITH_BUILD_SHA=*" } |
  Select-Object -First 1

if ($appMetadata[0].Os -ne "linux" -or $appMetadata[0].Architecture -ne "amd64") {
  throw "The app image must be linux/amd64."
}
if ($auditMetadata[0].Os -ne "linux" -or $auditMetadata[0].Architecture -ne "amd64") {
  throw "The visual-audit image must be linux/amd64."
}
if ($appBuildSha -ne ("WOODSMITH_BUILD_SHA=" + $CommitSha)) {
  throw "The app image build identity does not match CommitSha."
}

$shortSha = $CommitSha.Substring(0, 8)
$stamp = [DateTime]::UtcNow.ToString("yyyyMMddTHHmmssZ")
$suffix = ([Guid]::NewGuid().ToString("N")).Substring(0, 10)
$runId = "local-$Scope-$stamp-$shortSha-$suffix"
$appContainer = "woodsmith-local-audit-app-$suffix"
$dataVolume = "woodsmith-local-audit-data-$suffix"
$mediaVolume = "woodsmith-local-audit-media-$suffix"
$outputVolume = "woodsmith-local-audit-output-$suffix"
$secretVolume = "woodsmith-local-audit-secrets-$suffix"
$password = [Convert]::ToHexString(
  [Security.Cryptography.RandomNumberGenerator]::GetBytes(36)
).ToLowerInvariant()
$sessionSecret = [Convert]::ToHexString(
  [Security.Cryptography.RandomNumberGenerator]::GetBytes(48)
).ToLowerInvariant()
$auditToken = [Convert]::ToHexString(
  [Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
).ToLowerInvariant()
$failed = $true

try {
  Write-Output "AUDIT_RUN_ID=$runId"

  foreach ($volume in @(
    $dataVolume,
    $mediaVolume,
    $outputVolume,
    $secretVolume
  )) {
    Invoke-Docker volume create $volume | Out-Null
  }

  $initArguments = @(
    "run", "--rm", "--network", "none", "--user", "0",
    "-v", ($dataVolume + ":/data"),
    "-v", ($mediaVolume + ":/media"),
    "-v", ($outputVolume + ":/output"),
    "--entrypoint", "/bin/sh", $AppImage, "-c",
    "chown 1001:1001 /data /media /output && chmod 700 /data /output && chmod 755 /media"
  )
  Invoke-Docker @initArguments

  $secretArguments = @(
    "run", "--rm", "--network", "none", "--user", "0",
    "-e", ("AUDIT_PASSWORD=" + $password),
    "-e", ("AUDIT_TOKEN=" + $auditToken),
    "-v", ($secretVolume + ":/run/secrets"),
    "--entrypoint", "/bin/sh", $AuditImage, "-c",
    'umask 077; printf %s "$AUDIT_PASSWORD" > /run/secrets/admin_password; printf %s "$AUDIT_TOKEN" > /run/secrets/audit_token; chmod 444 /run/secrets/admin_password /run/secrets/audit_token'
  )
  Invoke-Docker @secretArguments

  $mediaScript = @'
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const files = [
  "Cabinets/PXL_20240624_020957542.jpg",
  "Cabinets/PXL_20240624_021020003.jpg",
  "Cabinets/PXL_20240624_021024485.jpg",
  "Cabinets/PXL_20240624_021031088.jpg",
  "Furniture/DSC_0051.JPG",
  "Furniture/DSC_0052.JPG",
  "Furniture/DSC_0053.JPG",
  "Furniture/IMG_20200621_172630.jpg",
  "Furniture/IMG_20200628_153747.jpg",
  "Furniture/IMG_20200628_153839.jpg",
  "Furniture/IMG_20210420_175427.jpg",
  "Furniture/IMG_20210420_175450.jpg",
  "Furniture/IMG_20210420_175507.jpg",
  "Furniture/PXL_20250222_201547090.jpg",
  "Furniture/PXL_20250302_223145008.jpg",
  "Furniture/PXL_20250302_223155446.jpg",
  "Furniture/PXL_20260319_000709864.jpg",
  "Furniture/PXL_20260319_000724223.jpg",
  "Furniture/PXL_20260321_195141872.jpg"
];

(async () => {
  for (let index = 0; index < files.length; index += 1) {
    const target = path.join("/output", files[index]);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const base = index % 2 === 0 ? "#d7c6a3" : "#5b3d29";
    const accent = index % 3 === 0 ? "#17130f" : "#f2ead9";
    const svg =
      '<svg width="1280" height="960" xmlns="http://www.w3.org/2000/svg">' +
      '<rect width="1280" height="960" fill="' + base + '"/>' +
      '<rect x="90" y="90" width="1100" height="780" rx="48" fill="' +
      accent + '" opacity=".38"/>' +
      '<path d="M120 720 L450 300 L760 650 L1020 240 L1160 720 Z" ' +
      'fill="#8f6f4f" opacity=".72"/>' +
      '<text x="640" y="850" text-anchor="middle" font-size="42" ' +
      'font-family="sans-serif" fill="#2b2118">Disposable visual-audit fixture ' +
      (index + 1) + "</text></svg>";

    await sharp(Buffer.from(svg))
      .jpeg({ quality: 88 })
      .toFile(target);
  }
  console.log("SYNTHETIC_MEDIA_COUNT=" + files.length);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
'@

  $mediaArguments = @(
    "run", "--rm", "--network", "none", "--user", "0",
    "-v", ($mediaVolume + ":/output"),
    "--entrypoint", "node", $AuditImage, "-e", $mediaScript
  )
  Invoke-Docker @mediaArguments

  $appArguments = @(
    "run", "-d", "--name", $appContainer,
    "--network", "none",
    "--read-only",
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges:true",
    "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=128m,mode=1777",
    "--tmpfs", "/app/site/.next/cache:rw,noexec,nosuid,nodev,size=128m,mode=700,uid=1001,gid=1001",
    "-v", ($dataVolume + ":/app/site/data:rw"),
    "-v", ($mediaVolume + ":/app/pics:ro"),
    "-v", ($secretVolume + ":/run/secrets:ro"),
    "-e", "NODE_ENV=production",
    "-e", "SELF_HOSTED=true",
    "-e", "SITE_URL=http://127.0.0.1:3002",
    "-e", "NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3002",
    "-e", "MEDIA_ROOT=/app/pics",
    "-e", "DATA_ROOT=/app/site/data",
    "-e", ("STUDIO_PASSWORD=" + $password),
    "-e", ("SESSION_SECRET=" + $sessionSecret),
    "-e", "VISUAL_AUDIT_TOKEN_FILE=/run/secrets/audit_token",
    "-e", "VISUAL_AUDIT_MAX_RECORDS=5000",
    "-e", "STRIPE_SECRET_KEY=",
    "-e", "STRIPE_PUBLISHABLE_KEY=",
    "-e", "EASYPOST_API_KEY=",
    "-e", "SMTP_HOST=",
    "-e", "SMTP_USER=",
    "-e", "SMTP_PASSWORD=",
    "-e", "OPENAI_API_KEY=",
    "-e", "ENABLE_PUBLIC_AI_RENDERING=false",
    "-e", "ENABLE_AI_BACKGROUND_CLEANUP=false",
    "-e", "ENABLE_AI_MEDIA_ANALYSIS=false",
    "-e", "ENABLE_EMBEDDING_SEARCH=false",
    "-e", "ENABLE_LOCAL_IMAGE_EMBEDDINGS=false",
    "-e", "ENABLE_GEMINI_FALLBACK=false",
    "-e", "AI_PROVIDER=disabled",
    "-e", "AI_ANALYSIS_PROVIDER=disabled",
    "-e", "AI_EMBEDDING_PROVIDER=disabled",
    "-e", "AI_FALLBACK_PROVIDER=disabled",
    "-e", "LOCAL_AI_SIDECAR_URL=http://127.0.0.1:9",
    "-e", "OLLAMA_BASE_URL=http://127.0.0.1:9",
    $AppImage
  )
  Invoke-Docker @appArguments | Out-Null

  $ready = $false
  for ($attempt = 1; $attempt -le 60; $attempt += 1) {
    & docker exec $appContainer node -e "fetch('http://127.0.0.1:3002/studio/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
    if ($LASTEXITCODE -eq 0) {
      $ready = $true
      Write-Output "APP_READY_ATTEMPT=$attempt"
      break
    }
    Start-Sleep -Seconds 2
  }
  if (-not $ready) {
    throw "The disposable application did not become ready."
  }

  $runnerArguments = @(
    "--rm",
    "--network", ("container:" + $appContainer),
    "--user", "1001:1001",
    "--read-only",
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges:true",
    "--ipc", "host",
    "--tmpfs", "/audit-tmp:rw,nosuid,nodev,size=128m,mode=700,uid=1001,gid=1001",
    "--tmpfs", "/tmp:rw,nosuid,nodev,size=256m,mode=1777",
    "-v", ($outputVolume + ":/output:rw"),
    "-v", ($secretVolume + ":/run/secrets:ro"),
    "-e", "TARGET_MODE=live-readonly",
    "-e", "BASE_URL=http://127.0.0.1:3002",
    "-e", ("TARGET_COMMIT_SHA=" + $CommitSha),
    "-e", ("AUDIT_RUN_ID=" + $runId),
    "-e", ("AUDIT_SCOPE=" + $Scope),
    "-e", "AUDIT_RESUME=true",
    "-e", "RUN_OUTPUT_ROOT=/output",
    "-e", "REPO_ROOT=/workspace",
    "-e", "AUDIT_TMP_ROOT=/audit-tmp",
    "-e", "WOODSMITH_ADMIN_EMAIL=woodsmithbb@proton.me",
    "-e", "ADMIN_PASSWORD_FILE=/run/secrets/admin_password",
    "-e", "AUDIT_TOKEN_FILE=/run/secrets/audit_token",
    "-e", "AUDIT_STRICT_DIAGNOSTICS=true"
  )

  Write-Output "CAPTURE_START"
  Invoke-Docker run @runnerArguments $AuditImage

  foreach ($step in @(
    @{ Name = "COMPARE"; Entry = "dist/diff.js" },
    @{ Name = "REPORT"; Entry = "dist/report.js" },
    @{ Name = "VALIDATE"; Entry = "dist/validate.js" }
  )) {
    Write-Output ($step.Name + "_START")
    $stepArguments = @("run") + $runnerArguments + @(
      "--entrypoint", "node", $AuditImage, $step.Entry
    )
    Invoke-Docker @stepArguments
  }

  $summaryScript = @'
const fs = require("node:fs");
const path = require("node:path");
const root = path.join("/output", process.env.AUDIT_RUN_ID);
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "manifest.json"), "utf8")
);
const validation = JSON.parse(
  fs.readFileSync(path.join(root, "validation.json"), "utf8")
);
const checksums = JSON.parse(
  fs.readFileSync(path.join(root, "checksums.json"), "utf8")
);
const walk = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const item = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(item) : [item];
  });
const files = walk(root);
const temporaryFiles = files.filter(
  (file) => /\.(tmp|part)$/i.test(file) || file.includes(".tmp-")
);
const shareableRoot = path.join(root, "shareable");
const shareableFiles = fs.existsSync(shareableRoot)
  ? walk(shareableRoot)
  : [];
const shareableImages = shareableFiles.filter(
  (file) => /\.(png|jpe?g|webp)$/i.test(file)
);
const skipFocused = manifest.captures.filter(
  (item) => item.state === "skip-link-focused"
).length;
const skipActivated = manifest.captures.filter(
  (item) => item.state === "skip-link-activated-main-focus"
).length;
const routeKeys = new Set(
  manifest.routes.map((item) => item.auth + ":" + item.route)
);
const result = {
  runId: process.env.AUDIT_RUN_ID,
  passed: validation.passed,
  failures: validation.failures.length,
  unexpectedDiagnostics: validation.diagnostics.length,
  captures: manifest.captures.length,
  routes: routeKeys.size,
  skipFocused,
  skipActivated,
  unsafeSuccessful: manifest.security.successfulUnsafeRequests,
  unsafeBlocked: manifest.security.sameOriginUnsafeRequestsBlocked,
  tokenEligible: manifest.security.tokenEligibleRequests,
  crossOrigin: manifest.security.crossOriginRequests,
  checksums: checksums.length,
  totalFiles: files.length,
  temporaryFiles: temporaryFiles.length,
  shareableImages: shareableImages.length
};
console.log(JSON.stringify(result, null, 2));

if (
  !result.passed ||
  result.failures !== 0 ||
  result.unexpectedDiagnostics !== 0 ||
  result.unsafeSuccessful !== 0 ||
  result.unsafeBlocked < 1 ||
  result.tokenEligible < 1 ||
  result.crossOrigin !== 0 ||
  result.temporaryFiles !== 0 ||
  result.skipFocused < 1 ||
  result.skipFocused !== result.skipActivated
) {
  process.exit(9);
}
'@

  $summaryArguments = @(
    "run", "--rm", "--network", "none", "--user", "1001:1001",
    "-v", ($outputVolume + ":/output:ro"),
    "-e", ("AUDIT_RUN_ID=" + $runId),
    "--entrypoint", "node", $AuditImage, "-e", $summaryScript
  )
  Invoke-Docker @summaryArguments

  $applicationLogs = @(& docker logs $appContainer 2>&1)
  $logFailures = @(
    $applicationLogs |
      Select-String -Pattern "EACCES|unhandledRejection|Failed to write image to cache"
  )
  Write-Output ("SERVER_LOG_FAILURES=" + $logFailures.Count)
  if ($logFailures.Count -gt 0) {
    $logFailures | ForEach-Object { Write-Error $_.Line }
    throw "The disposable application emitted cache or unhandled-rejection failures."
  }

  $failed = $false
  Write-Output "LOCAL_DISPOSABLE_AUDIT_OK=1"
}
finally {
  $existingApp = @(
    & docker ps -a --format "{{.Names}}" |
      Where-Object { $_ -eq $appContainer }
  )
  if ($failed -and $existingApp.Count -gt 0) {
    Write-Output "APP_LOG_TAIL_BEGIN"
    & docker logs --tail 200 $appContainer
    Write-Output "APP_LOG_TAIL_END"
  }

  & docker rm -f $appContainer 2>$null | Out-Null
  foreach ($volume in @(
    $dataVolume,
    $mediaVolume,
    $outputVolume,
    $secretVolume
  )) {
    & docker volume rm -f $volume 2>$null | Out-Null
  }

  $remainingContainers = @(
    & docker ps -a --format "{{.Names}}" |
      Where-Object { $_ -like ("*" + $suffix + "*") }
  )
  $remainingVolumes = @(
    & docker volume ls --format "{{.Name}}" |
      Where-Object { $_ -like ("*" + $suffix + "*") }
  )
  Write-Output ("CLEANUP_CONTAINERS=" + $remainingContainers.Count)
  Write-Output ("CLEANUP_VOLUMES=" + $remainingVolumes.Count)
}
