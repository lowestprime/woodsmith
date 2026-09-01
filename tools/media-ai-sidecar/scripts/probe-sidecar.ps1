[CmdletBinding()]
param(
  [string]$BaseUrl = $(if ($env:LOCAL_AI_SIDECAR_URL) { $env:LOCAL_AI_SIDECAR_URL } else { "http://127.0.0.1:8765" }),
  [int]$TimeoutSeconds = 5
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$headers = @{}
if (-not [string]::IsNullOrWhiteSpace($env:LOCAL_AI_SIDECAR_TOKEN)) {
  $headers.Authorization = "Bearer $($env:LOCAL_AI_SIDECAR_TOKEN)"
}
$health = Invoke-RestMethod -Method Get -Uri ($BaseUrl.TrimEnd("/") + "/health") -Headers $headers -TimeoutSec $TimeoutSeconds
if ($health.ok -ne $true) {
  throw "The sidecar health endpoint did not report ok=true."
}

$wrongTokenRejected = $null
if ($headers.ContainsKey("Authorization")) {
  try {
    Invoke-WebRequest -Method Get -Uri ($BaseUrl.TrimEnd("/") + "/health") `
      -Headers @{ Authorization = "Bearer intentionally-wrong-health-probe" } `
      -TimeoutSec $TimeoutSeconds | Out-Null
    $wrongTokenRejected = $false
  }
  catch {
    $status = [int]$_.Exception.Response.StatusCode
    $wrongTokenRejected = $status -eq 401
  }
  if (-not $wrongTokenRejected) {
    throw "The sidecar did not reject a nonmatching bearer token."
  }
}

[ordered]@{
  ok = $health.ok
  service = $health.service
  version = $health.version
  model = $health.model
  mediaRootReadable = $health.mediaRootReadable
  accelerator = $health.embedding.accelerator
  queue = $health.queue
  work = $health.work
  wrongTokenRejected = $wrongTokenRejected
} | ConvertTo-Json -Depth 8
