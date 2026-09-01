[CmdletBinding()]
param(
  [ValidateRange(1, 300)]
  [int]$RestartDelaySeconds = 5,
  [ValidateRange(0, 1000)]
  [int]$MaxRestarts = 0,
  [switch]$RestartOnCleanExit
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$runner = Join-Path $PSScriptRoot "run-sidecar.ps1"
$powerShell = (Get-Process -Id $PID).Path
$quotedRunner = '"' + $runner.Replace('"', '\"') + '"'
$restarts = 0
while ($true) {
  $process = Start-Process -FilePath $powerShell `
    -ArgumentList @("-NoProfile", "-File", $quotedRunner) `
    -WindowStyle Hidden -Wait -PassThru
  $code = $process.ExitCode
  if ($code -eq 0 -and -not $RestartOnCleanExit) {
    exit 0
  }
  $restarts += 1
  if ($MaxRestarts -gt 0 -and $restarts -gt $MaxRestarts) {
    throw "Sidecar restart limit exceeded after exit code $code."
  }
  Write-Warning "Sidecar exited with code $code; restart $restarts begins in $RestartDelaySeconds seconds."
  Start-Sleep -Seconds $RestartDelaySeconds
}
