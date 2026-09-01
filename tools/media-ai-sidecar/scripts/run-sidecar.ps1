[CmdletBinding()]
param(
  [string]$MediaRoot = $env:MEDIA_AI_MEDIA_ROOT,
  [string]$CachePath = $env:MEDIA_AI_CACHE,
  [string]$HostAddress = $(if ($env:MEDIA_AI_HOST) { $env:MEDIA_AI_HOST } else { "127.0.0.1" }),
  [int]$Port = $(if ($env:MEDIA_AI_PORT) { [int]$env:MEDIA_AI_PORT } else { 8765 }),
  [string]$Python = "python"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ([string]::IsNullOrWhiteSpace($MediaRoot) -or -not (Test-Path -LiteralPath $MediaRoot -PathType Container)) {
  throw "MEDIA_AI_MEDIA_ROOT must identify an existing directory."
}
if ([string]::IsNullOrWhiteSpace($CachePath)) {
  throw "MEDIA_AI_CACHE must identify a cache file outside the media root."
}
if ($Port -lt 1 -or $Port -gt 65535) {
  throw "MEDIA_AI_PORT must be from 1 through 65535."
}

$resolvedMedia = (Resolve-Path -LiteralPath $MediaRoot).Path.TrimEnd("\", "/")
$resolvedCache = [IO.Path]::GetFullPath($CachePath)
$cacheParent = Split-Path -Parent $resolvedCache
if ([string]::IsNullOrWhiteSpace($cacheParent)) {
  throw "MEDIA_AI_CACHE must include a parent directory."
}
[IO.Directory]::CreateDirectory($cacheParent) | Out-Null
$resolvedCacheParent = (Resolve-Path -LiteralPath $cacheParent).Path.TrimEnd("\", "/")
if ($resolvedCacheParent.Equals($resolvedMedia, [StringComparison]::OrdinalIgnoreCase) -or
    $resolvedCacheParent.StartsWith($resolvedMedia + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw "MEDIA_AI_CACHE must remain outside the source media tree."
}

$loopback = $HostAddress -in @("127.0.0.1", "::1", "localhost")
if (-not $loopback -and [string]::IsNullOrWhiteSpace($env:MEDIA_AI_SIDECAR_TOKEN)) {
  throw "MEDIA_AI_SIDECAR_TOKEN is required when binding beyond loopback."
}

$env:MEDIA_AI_MEDIA_ROOT = $resolvedMedia
$env:MEDIA_AI_CACHE = $resolvedCache
$env:MEDIA_AI_HOST = $HostAddress
$env:MEDIA_AI_PORT = [string]$Port

$packageRoot = Split-Path -Parent $PSScriptRoot
$exitCode = 1
Push-Location $packageRoot
try {
  & $Python -m media_ai_sidecar --host $HostAddress --port $Port --media-root $resolvedMedia --cache $resolvedCache
  $exitCode = $LASTEXITCODE
}
finally {
  Pop-Location
}
exit $exitCode
