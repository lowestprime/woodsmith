[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern("^[A-Za-z0-9][A-Za-z0-9_.-]{0,191}$")]
    [string]$SourceVolume,

    [Parameter(Mandatory = $true)]
    [ValidatePattern("^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$")]
    [string]$RunId,

    [Parameter(Mandatory = $true)]
    [ValidateRange(1, 8)]
    [int]$Workers,

    [Parameter(Mandatory = $true)]
    [string]$AuditImage,

    [Parameter(Mandatory = $true)]
    [ValidatePattern("^[0-9a-f]{40}$")]
    [string]$TargetCommit,

    [ValidateRange(0, 255)]
    [int]$ExpectedValidatorExit = 1
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Invoke-DockerChecked {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)
    & docker @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "docker $($Arguments[0]) failed with exit code $LASTEXITCODE."
    }
}

$suffix = [Guid]::NewGuid().ToString("N").Substring(0, 10)
$scratchVolume = "woodsmith-validator-benchmark-$Workers-$suffix"
$copyWatch = [Diagnostics.Stopwatch]::StartNew()

try {
    Write-Output "BENCHMARK_STAGE=create worker=$Workers volume=$scratchVolume"
    $created = & docker volume create `
        --label "woodsmith.visual-audit=validator-benchmark" `
        --label "woodsmith.source=$SourceVolume" `
        $scratchVolume
    if ($LASTEXITCODE -ne 0 -or $created.Trim() -ne $scratchVolume) {
        throw "Unable to create disposable benchmark volume $scratchVolume."
    }

    Invoke-DockerChecked @(
        "run", "--rm", "--user", "0:0", "--network", "none", "--read-only", "--cap-drop", "ALL",
        "--security-opt", "no-new-privileges:true",
        "-v", "${scratchVolume}:/output:rw",
        "--entrypoint", "sh", $AuditImage,
        "-c", "chown 1001:1001 /output && chmod 700 /output"
    )

    Write-Output "BENCHMARK_STAGE=clone worker=$Workers"
    Invoke-DockerChecked @(
        "run", "--rm", "--user", "1001:1001", "--network", "none", "--read-only",
        "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
        "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=16m,uid=1001,gid=1001,mode=700",
        "-v", "${SourceVolume}:/source:ro", "-v", "${scratchVolume}:/output:rw",
        "--entrypoint", "sh", $AuditImage,
        "-c", "find /source -mindepth 1 -maxdepth 1 -exec cp -a {} /output/ ';'"
    )
    $copyWatch.Stop()
    Write-Output "BENCHMARK_STAGE=validate worker=$Workers cloneSeconds=$([Math]::Round($copyWatch.Elapsed.TotalSeconds, 3))"

    $validatorArgs = @(
        "run", "--rm", "--user", "1001:1001", "--network", "none", "--read-only",
        "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
        "--tmpfs", "/run/secrets:rw,noexec,nosuid,nodev,size=1m,uid=1001,gid=1001,mode=700",
        "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=512m,uid=1001,gid=1001,mode=700",
        "-v", "${scratchVolume}:/output:rw",
        "-e", "TARGET_MODE=live-readonly",
        "-e", "AUDIT_EVIDENCE_TIER=tier-3-live-production",
        "-e", "BASE_URL=https://woodmat.ch",
        "-e", "TARGET_COMMIT_SHA=$TargetCommit",
        "-e", "AUDIT_RUN_ID=$RunId",
        "-e", "AUDIT_SCOPE=full",
        "-e", "RUN_OUTPUT_ROOT=/output",
        "-e", "REPO_ROOT=/workspace",
        "-e", "WOODSMITH_ADMIN_EMAIL=benchmark@example.invalid",
        "-e", "ADMIN_PASSWORD_FILE=/run/secrets/admin_password",
        "-e", "AUDIT_TOKEN_FILE=/run/secrets/audit_token",
        "-e", "AUDIT_TMP_ROOT=/tmp/audit",
        "-e", "VISUAL_AUDIT_VALIDATION_WORKERS=$Workers",
        "--entrypoint", "sh", $AuditImage,
        "-c", "umask 077; head -c 48 /dev/urandom | base64 > /run/secrets/admin_password; head -c 48 /dev/urandom | base64 > /run/secrets/audit_token; exec node dist/benchmark-validator.js"
    )
    $validatorOutput = [Collections.Generic.List[string]]::new()
    & docker @validatorArgs 2>&1 | ForEach-Object {
        $line = $_.ToString()
        $validatorOutput.Add($line)
        Write-Output $line
    }
    $validatorExit = $LASTEXITCODE
    if ($validatorExit -ne $ExpectedValidatorExit) {
        throw "Validator exited $validatorExit; expected $ExpectedValidatorExit for the retained failed archive."
    }

    $benchmarkLine = $validatorOutput | Where-Object { $_.StartsWith("VALIDATOR_BENCHMARK=") } | Select-Object -Last 1
    if (-not $benchmarkLine) {
        throw "Validator benchmark output marker is missing."
    }
    $benchmark = $benchmarkLine.Substring("VALIDATOR_BENCHMARK=".Length) | ConvertFrom-Json

    $summaryScript = @'
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const runRoot = path.join("/output", process.env.AUDIT_RUN_ID);
const sourceRunRoot = path.join("/source", process.env.AUDIT_RUN_ID);
const read = (name) => fs.readFileSync(path.join(runRoot, name));
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const validationBytes = read("validation.json");
const checksumsJson = read("checksums.json");
const checksumsSha = read("checksums.sha256");
const validation = JSON.parse(validationBytes.toString("utf8"));
const priorValidation = JSON.parse(fs.readFileSync(path.join(sourceRunRoot, "validation.json"), "utf8"));
const priorFailures = new Set(priorValidation.failures);
const currentFailures = new Set(validation.failures);
const addedFailures = validation.failures.filter((failure) => !priorFailures.has(failure));
const removedFailures = priorValidation.failures.filter((failure) => !currentFailures.has(failure));
console.log(JSON.stringify({
  passed: validation.passed,
  failureCount: validation.failures.length,
  diagnosticCount: validation.diagnostics.length,
  checksumCount: validation.checksumCount,
  semanticDigest: hash(JSON.stringify({ failures: validation.failures, diagnostics: validation.diagnostics })),
  failureDifference: {
    addedCount: addedFailures.length,
    removedCount: removedFailures.length,
    added: addedFailures,
    removed: removedFailures
  },
  validationHash: hash(validationBytes),
  checksumsJsonHash: hash(checksumsJson),
  checksumsShaHash: hash(checksumsSha)
}));
'@
    $summaryRaw = & docker run --rm --user 1001:1001 --network none --read-only `
        --cap-drop ALL --security-opt no-new-privileges:true `
        -v "${scratchVolume}:/output:ro" `
        -v "${SourceVolume}:/source:ro" `
        -e "AUDIT_RUN_ID=$RunId" `
        --entrypoint node $AuditImage -e $summaryScript
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to summarize disposable benchmark output."
    }
    $summary = $summaryRaw | ConvertFrom-Json
    $result = [ordered]@{
        workers = $Workers
        cloneSeconds = [Math]::Round($copyWatch.Elapsed.TotalSeconds, 3)
        validator = $benchmark
        archive = $summary
    }
    Write-Output "FULL_VALIDATOR_BENCHMARK=$($result | ConvertTo-Json -Depth 5 -Compress)"
}
finally {
    Write-Output "BENCHMARK_STAGE=cleanup worker=$Workers volume=$scratchVolume"
    & docker volume rm -f $scratchVolume | Out-Null
    $removeExit = $LASTEXITCODE
    $remaining = @(& docker volume ls --quiet --filter "name=^${scratchVolume}$")
    if ($removeExit -ne 0 -or $LASTEXITCODE -ne 0 -or $remaining -contains $scratchVolume) {
        throw "Disposable benchmark volume was not removed: $scratchVolume"
    }
    Write-Output "BENCHMARK_CLEANUP=PASS worker=$Workers"
}
