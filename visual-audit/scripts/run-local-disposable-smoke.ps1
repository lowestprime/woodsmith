[CmdletBinding()]
param(
  [string]$AppImage = "woodsmith:local-gate",
  [string]$AuditImage = "woodsmith-visual-audit:local-gate",
  [string]$CommitSha = "",
  [ValidateSet("live-readonly", "snapshot-lab")]
  [string]$TargetMode = "live-readonly",
  [ValidateSet("smoke", "full")]
  [string]$Scope = "smoke",
  [ValidateRange(1, 6)]
  [int]$CaptureWorkers = 2,
  [ValidateRange(1, 8)]
  [int]$ValidationWorkers = 6,
  [ValidateRange(1, 8)]
  [int]$ReportWorkers = 6,
  [string]$ResumeRunId = "",
  [string]$ResumeOutputVolume = ""
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

$hasResumeRunId = -not [string]::IsNullOrWhiteSpace($ResumeRunId)
$hasResumeOutputVolume = -not [string]::IsNullOrWhiteSpace($ResumeOutputVolume)
if ($hasResumeRunId -ne $hasResumeOutputVolume) {
  throw "ResumeRunId and ResumeOutputVolume must be supplied together."
}
$resumeExistingRun = $hasResumeRunId -and $hasResumeOutputVolume
if ($resumeExistingRun) {
  if ($ResumeRunId -notmatch "^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$") {
    throw "ResumeRunId contains unsupported characters."
  }
  if ($ResumeOutputVolume -notmatch "^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$") {
    throw "ResumeOutputVolume contains unsupported characters."
  }
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
$expectedBuildSha = "WOODSMITH_BUILD_SHA=" + $CommitSha
$appBuildIdentity = if ($appBuildSha -eq $expectedBuildSha) {
  "exact"
} elseif (
  $appBuildSha -eq "WOODSMITH_BUILD_SHA=unknown" -and
  $Scope -eq "smoke"
) {
  "unknown-loopback-smoke"
} else {
  throw "The app image build identity does not match CommitSha. Only an unstamped loopback disposable smoke is permitted before commit."
}

$shortSha = $CommitSha.Substring(0, 8)
$stamp = [DateTime]::UtcNow.ToString("yyyyMMddTHHmmssZ")
$suffix = ([Guid]::NewGuid().ToString("N")).Substring(0, 10)
$modeLabel = if ($TargetMode -eq "snapshot-lab") { "lab" } else { "readonly" }
$runId = if ($resumeExistingRun) {
  $ResumeRunId
} else {
  "local-$modeLabel-$Scope-$stamp-$shortSha-$suffix"
}
$appContainer = "woodsmith-local-audit-app-$suffix"
$dataVolume = "woodsmith-local-audit-data-$suffix"
$mediaVolume = "woodsmith-local-audit-media-$suffix"
$labDataVolume = "woodsmith-local-audit-lab-data-$suffix"
$labMediaVolume = "woodsmith-local-audit-lab-media-$suffix"
$outputVolume = if ($resumeExistingRun) {
  $ResumeOutputVolume
} else {
  "woodsmith-local-audit-output-$suffix"
}
$secretVolume = "woodsmith-local-audit-secrets-$suffix"
$managedVolumes = @(
  $dataVolume,
  $mediaVolume,
  $secretVolume
)
if (-not $resumeExistingRun) {
  $managedVolumes += $outputVolume
}
if ($TargetMode -eq "snapshot-lab") {
  $managedVolumes += @($labDataVolume, $labMediaVolume)
}
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
  Write-Output ("AUDIT_RESUME_EXISTING=" + $resumeExistingRun)
  Write-Output ("APP_BUILD_IDENTITY=" + $appBuildIdentity)

  foreach ($volume in $managedVolumes) {
    Invoke-Docker volume create $volume | Out-Null
  }

  if ($resumeExistingRun) {
    $matchingOutputVolume = @(
      & docker volume ls --quiet --filter ("name=^" + $outputVolume + "$")
    )
    if ($LASTEXITCODE -ne 0 -or $matchingOutputVolume -notcontains $outputVolume) {
      throw "ResumeOutputVolume does not exist."
    }

    $resumeMetadataScript = @'
const fs = require("node:fs");
const path = require("node:path");
const runRoot = path.join("/output", process.env.AUDIT_RUN_ID);
const manifest = JSON.parse(
  fs.readFileSync(path.join(runRoot, "manifest.json"), "utf8")
);
const expected = {
  runId: process.env.AUDIT_RUN_ID,
  mode: process.env.TARGET_MODE,
  scope: process.env.AUDIT_SCOPE,
  evidenceTier: process.env.AUDIT_EVIDENCE_TIER,
  commit: process.env.TARGET_COMMIT_SHA
};
const actual = {
  runId: manifest.runId,
  mode: manifest.mode,
  scope: manifest.scope,
  evidenceTier: manifest.evidenceTier,
  commit: manifest.expectedCommit
};
if (
  actual.runId !== expected.runId ||
  actual.mode !== expected.mode ||
  actual.scope !== expected.scope ||
  actual.evidenceTier !== expected.evidenceTier ||
  actual.commit !== expected.commit
) {
  console.error(JSON.stringify({ expected, actual }));
  process.exit(12);
}
console.log(JSON.stringify(actual));
'@
    $resumeMetadataArguments = @(
      "run", "--rm", "--network", "none", "--read-only", "--user", "1001:1001",
      "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
      "-v", ($outputVolume + ":/output:ro"),
      "-e", ("AUDIT_RUN_ID=" + $runId),
      "-e", ("TARGET_MODE=" + $TargetMode),
      "-e", ("AUDIT_SCOPE=" + $Scope),
      "-e", "AUDIT_EVIDENCE_TIER=tier-1-synthetic",
      "-e", ("TARGET_COMMIT_SHA=" + $CommitSha),
      "--entrypoint", "node", $AuditImage, "-e", $resumeMetadataScript
    )
    Invoke-Docker @resumeMetadataArguments
  }

  $initMounts = @(
    "-v", ($dataVolume + ":/data"),
    "-v", ($mediaVolume + ":/media")
  )
  $initTargets = "/data /media"
  if (-not $resumeExistingRun) {
    $initMounts += @("-v", ($outputVolume + ":/output"))
    $initTargets += " /output"
  }
  if ($TargetMode -eq "snapshot-lab") {
    $initMounts += @(
      "-v", ($labDataVolume + ":/lab-data"),
      "-v", ($labMediaVolume + ":/lab-media")
    )
    $initTargets += " /lab-data /lab-media"
  }
  $initArguments = @(
    "run", "--rm", "--network", "none", "--user", "0"
  )
  $initArguments += $initMounts
  $initArguments += @(
    "--entrypoint", "/bin/sh", $AppImage, "-c",
    ("chown 1001:1001 " + $initTargets +
      " && chmod 700 /data" +
      $(if (-not $resumeExistingRun) { " /output" } else { "" }) +
      $(if ($TargetMode -eq "snapshot-lab") { " /lab-data" } else { "" }) +
      " && chmod 755 /media" +
      $(if ($TargetMode -eq "snapshot-lab") { " /lab-media" } else { "" }))
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

  function New-AppArguments {
    param(
      [string]$DataVolume,
      [string]$MediaVolume,
      [ValidateSet("ro", "rw")]
      [string]$MediaAccess,
      [string]$CloneDataVolume = ""
    )

    $arguments = @(
      "run", "-d", "--name", $appContainer,
      "--network", "none",
      "--read-only",
      "--cap-drop", "ALL",
      "--security-opt", "no-new-privileges:true",
      "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=128m,mode=1777",
      "--tmpfs", "/app/site/.next/cache:rw,noexec,nosuid,nodev,size=128m,mode=700,uid=1001,gid=1001",
      "-v", ($DataVolume + ":/app/site/data:rw"),
      "-v", ($MediaVolume + ":/app/pics:" + $MediaAccess),
      "-v", ($secretVolume + ":/run/secrets:ro")
    )
    if (-not [string]::IsNullOrWhiteSpace($CloneDataVolume)) {
      $arguments += @("-v", ($CloneDataVolume + ":/clone:rw"))
    }
    $arguments += @(
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
      "-e", "WOODSMITH_MEDIA_PROVENANCE=synthetic-fixture",
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
    return $arguments
  }

  function Wait-DisposableApp {
    param([string]$Label)

    for ($attempt = 1; $attempt -le 60; $attempt += 1) {
      & docker exec $appContainer node -e "fetch('http://127.0.0.1:3002/studio/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
      if ($LASTEXITCODE -eq 0) {
        Write-Output ("APP_READY_" + $Label + "_ATTEMPT=" + $attempt)
        return
      }
      Start-Sleep -Seconds 2
    }
    throw "The disposable application did not become ready."
  }

  $fingerprintScript = @'
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const root = "/input";
const files = [];
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (entry.isFile()) files.push(absolute);
    else throw new Error("Fingerprint input contains a non-file entry.");
  }
};
walk(root);
files.sort();
const hash = crypto.createHash("sha256");
for (const file of files) {
  hash.update(path.relative(root, file));
  hash.update("\0");
  hash.update(fs.readFileSync(file));
  hash.update("\0");
}
console.log(hash.digest("hex"));
'@

  function Get-VolumeFingerprint {
    param([string]$Volume)

    $result = @(
      & docker run --rm --network none --read-only --user 1001:1001 `
        --cap-drop ALL --security-opt no-new-privileges:true `
        -v ($Volume + ":/input:ro") --entrypoint node $AuditImage `
        -e $fingerprintScript
    )
    if ($LASTEXITCODE -ne 0 -or $result.Count -eq 0) {
      throw "Unable to fingerprint disposable volume $Volume."
    }
    return $result[-1].Trim()
  }

  $activeDataVolume = $dataVolume
  $activeMediaVolume = $mediaVolume
  $activeMediaAccess = "ro"
  $sourceDataBefore = ""
  $sourceMediaBefore = ""

  if ($TargetMode -eq "snapshot-lab") {
    $sourceArguments = @(
      New-AppArguments -DataVolume $dataVolume -MediaVolume $mediaVolume `
        -MediaAccess "ro" -CloneDataVolume $labDataVolume
    )
    Invoke-Docker @sourceArguments | Out-Null
    Wait-DisposableApp -Label "SOURCE"

    $cloneDatabaseScript = @'
const { DatabaseSync } = require("node:sqlite");
const source = new DatabaseSync("/app/site/data/woodsmith.sqlite");
source.exec("VACUUM INTO '/clone/woodsmith.sqlite'");
source.close();
const clone = new DatabaseSync("/clone/woodsmith.sqlite", { readOnly: true });
const quickCheck = clone.prepare("PRAGMA quick_check").all();
clone.close();
if (!quickCheck.some((row) => row.quick_check === "ok")) process.exit(1);
console.log("SNAPSHOT_CLONE_QUICK_CHECK=ok");
'@
    $cloneDatabaseArguments = @(
      "exec", $appContainer, "node", "--experimental-sqlite", "-e", $cloneDatabaseScript
    )
    Invoke-Docker @cloneDatabaseArguments

    $copyMediaArguments = @(
      "run", "--rm", "--network", "none", "--user", "0",
      "-v", ($mediaVolume + ":/source:ro"),
      "-v", ($labMediaVolume + ":/target:rw"),
      "--entrypoint", "/bin/sh", $AppImage, "-c",
      "cp -a /source/. /target/ && chown -R 1001:1001 /target"
    )
    Invoke-Docker @copyMediaArguments
    Invoke-Docker rm -f $appContainer | Out-Null

    $sourceDataBefore = Get-VolumeFingerprint -Volume $dataVolume
    $sourceMediaBefore = Get-VolumeFingerprint -Volume $mediaVolume
    $activeDataVolume = $labDataVolume
    $activeMediaVolume = $labMediaVolume
    $activeMediaAccess = "rw"
  }

  $appArguments = @(
    New-AppArguments -DataVolume $activeDataVolume -MediaVolume $activeMediaVolume `
      -MediaAccess $activeMediaAccess
  )
  Invoke-Docker @appArguments | Out-Null
  Wait-DisposableApp -Label $(if ($TargetMode -eq "snapshot-lab") { "LAB" } else { "READONLY" })

  $runnerArguments = @(
    "--rm",
    "--network", ("container:" + $appContainer),
    "--user", "1001:1001",
    "--read-only",
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges:true",
    "--ipc", "host",
    "--tmpfs", "/audit-tmp:rw,nosuid,nodev,size=128m,mode=700,uid=1001,gid=1001",
    "--tmpfs", "/tmp:rw,nosuid,nodev,size=512m,mode=1777",
    "-v", ($outputVolume + ":/output:rw"),
    "-v", ($secretVolume + ":/run/secrets:ro"),
    "-e", ("TARGET_MODE=" + $TargetMode),
    "-e", "AUDIT_EVIDENCE_TIER=tier-1-synthetic",
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
    "-e", "AUDIT_STRICT_DIAGNOSTICS=true",
    "-e", ("VISUAL_AUDIT_CAPTURE_WORKERS=" + $CaptureWorkers),
    "-e", ("VISUAL_AUDIT_VALIDATION_WORKERS=" + $ValidationWorkers),
    "-e", ("VISUAL_AUDIT_REPORT_WORKERS=" + $ReportWorkers)
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
const reportIndex = JSON.parse(
  fs.readFileSync(path.join(root, "report", "report-index.json"), "utf8")
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
  targetMode: process.env.TARGET_MODE,
  evidenceTier: manifest.evidenceTier,
  mediaProvenance: manifest.inventory.mediaEvidence.provenance,
  liveMediaPassed: manifest.mediaEvidence?.liveMedia?.passed === true,
  placeholderGatePassed: manifest.mediaEvidence?.placeholders?.passed === true,
  passed: validation.passed,
  failures: validation.failures.length,
  unexpectedDiagnostics: validation.diagnostics.length,
  captures: manifest.captures.length,
  routes: routeKeys.size,
  skipFocused,
  skipActivated,
  snapshotLabSaved: manifest.captures.filter(
    (item) => item.state === "snapshot-lab-commission-draft-saved"
  ).length,
  snapshotLabMutationStates: new Set(
    manifest.captures
      .filter((item) => item.state.startsWith("snapshot-lab-"))
      .map((item) => item.state)
  ).size,
  unsafeSuccessful: manifest.security.successfulUnsafeRequests,
  unsafeBlocked: manifest.security.sameOriginUnsafeRequestsBlocked,
  tokenEligible: manifest.security.tokenEligibleRequests,
  crossOrigin: manifest.security.crossOriginRequests,
  checksums: checksums.length,
  reportSourceCaptures: reportIndex.sourceCaptureCount,
  reportSelectedCaptures: reportIndex.captureCount,
  shareableSourceCaptures: reportIndex.shareableSourceCaptureCount,
  shareableSelectedCaptures: reportIndex.shareableCaptureCount,
  restrictedPrintPages: reportIndex.restrictedPrintPages,
  shareablePrintPages: reportIndex.shareablePrintPages,
  totalFiles: files.length,
  temporaryFiles: temporaryFiles.length,
  shareableImages: shareableImages.length
};
console.log(JSON.stringify(result, null, 2));

const hasProjects = manifest.inventory.counts.projects > 0;
const expectedUnsafeSuccessful = result.targetMode === "snapshot-lab"
  ? hasProjects ? 12 : 10
  : 0;
const expectedMutationStates = hasProjects ? 7 : 6;

if (
  !result.passed ||
  result.evidenceTier !== "tier-1-synthetic" ||
  result.mediaProvenance !== "synthetic-fixture" ||
  !result.liveMediaPassed ||
  !result.placeholderGatePassed ||
  result.failures !== 0 ||
  result.unexpectedDiagnostics !== 0 ||
  result.unsafeSuccessful !== expectedUnsafeSuccessful ||
  (result.targetMode === "live-readonly" && result.unsafeBlocked < 1) ||
  (result.targetMode === "snapshot-lab" && result.snapshotLabSaved !== 1) ||
  (result.targetMode === "snapshot-lab" && result.snapshotLabMutationStates !== expectedMutationStates) ||
  result.tokenEligible < 1 ||
  result.crossOrigin !== 0 ||
  result.reportSourceCaptures !== result.captures ||
  result.reportSelectedCaptures < 1 ||
  result.reportSelectedCaptures > result.reportSourceCaptures ||
  result.shareableSelectedCaptures < 1 ||
  result.shareableSelectedCaptures > result.shareableSourceCaptures ||
  result.restrictedPrintPages < result.reportSelectedCaptures ||
  result.shareablePrintPages < result.shareableSelectedCaptures ||
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
    "-e", ("TARGET_MODE=" + $TargetMode),
    "--entrypoint", "node", $AuditImage, "-e", $summaryScript
  )
  Invoke-Docker @summaryArguments

  if ($TargetMode -eq "snapshot-lab") {
    $labStateScript = @'
const { DatabaseSync } = require("node:sqlite");
const database = new DatabaseSync("/data/woodsmith.sqlite", { readOnly: true });
const quickCheck = database.prepare("PRAGMA quick_check").all();
const draftCount = database.prepare("SELECT COUNT(*) AS count FROM commission_drafts").get().count;
database.close();
console.log(JSON.stringify({
  quickCheck: quickCheck.some((row) => row.quick_check === "ok"),
  draftCount
}));
'@
    $labStateOutput = @(
      & docker run --rm --network none --read-only --user 1001:1001 `
        --cap-drop ALL --security-opt no-new-privileges:true `
        -v ($labDataVolume + ":/data:ro") --entrypoint node $AppImage `
        --experimental-sqlite -e $labStateScript
    )
    if ($LASTEXITCODE -ne 0 -or $labStateOutput.Count -eq 0) {
      throw "Unable to verify the disposable snapshot-lab database."
    }
    $labState = $labStateOutput[-1] | ConvertFrom-Json
    if (-not $labState.quickCheck -or $labState.draftCount -ne 0) {
      throw "The disposable snapshot lab failed quick_check or retained commission drafts."
    }

    $sourceDataAfter = Get-VolumeFingerprint -Volume $dataVolume
    $sourceMediaAfter = Get-VolumeFingerprint -Volume $mediaVolume
    $labMediaAfter = Get-VolumeFingerprint -Volume $labMediaVolume
    $sourceDataUnchanged = $sourceDataBefore -eq $sourceDataAfter
    $sourceMediaUnchanged = $sourceMediaBefore -eq $sourceMediaAfter
    $labMediaMatchesSource = $sourceMediaBefore -eq $labMediaAfter
    Write-Output ("SNAPSHOT_LAB_QUICK_CHECK=" + $labState.quickCheck)
    Write-Output ("SNAPSHOT_LAB_RESIDUAL_DRAFTS=" + $labState.draftCount)
    Write-Output ("SNAPSHOT_SOURCE_DATA_UNCHANGED=" + $sourceDataUnchanged)
    Write-Output ("SNAPSHOT_SOURCE_MEDIA_UNCHANGED=" + $sourceMediaUnchanged)
    Write-Output ("SNAPSHOT_LAB_MEDIA_MATCHES_SOURCE=" + $labMediaMatchesSource)
    if (-not $sourceDataUnchanged -or -not $sourceMediaUnchanged -or -not $labMediaMatchesSource) {
      throw "Snapshot-lab isolation or media-clone verification failed."
    }
  }

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

  if ($failed) {
    $availableOutputVolume = @(
      & docker volume ls --quiet --filter ("name=^" + $outputVolume + "$")
    )
    if ($LASTEXITCODE -ne 0 -or $availableOutputVolume -notcontains $outputVolume) {
      Write-Output "LOCAL_AUDIT_FAILURE_SUMMARY=unavailable"
    } else {
      $failureSummaryScript = @'
const fs = require("node:fs");
const path = require("node:path");
const validationPath = path.join(
  "/output",
  process.env.AUDIT_RUN_ID,
  "validation.json"
);
if (!fs.existsSync(validationPath)) {
  console.log("LOCAL_AUDIT_FAILURE_SUMMARY=unavailable");
  process.exit(0);
}
const validation = JSON.parse(fs.readFileSync(validationPath, "utf8"));
console.log(`LOCAL_AUDIT_FAILURE_SUMMARY=${JSON.stringify({
  passed: validation.passed,
  failureCount: validation.failures.length,
  failures: validation.failures.slice(0, 20),
  diagnosticCount: validation.diagnostics.length,
  diagnostics: validation.diagnostics.slice(0, 20)
})}`);
'@
      & docker run --rm --network none --read-only --user 1001:1001 `
        --cap-drop ALL --security-opt no-new-privileges:true `
        -v ($outputVolume + ":/output:ro") `
        -e ("AUDIT_RUN_ID=" + $runId) `
        --entrypoint node $AuditImage -e $failureSummaryScript 2>$null
    }
  }

  & docker rm -f $appContainer 2>$null | Out-Null
  foreach ($volume in $managedVolumes) {
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
