# Възстановява @oai/artifact-tool за presentation build (Windows).
# Пусни от root на repo-то:  powershell -File presentation/build/setup-deps.ps1
#
# Ред на опити:
#   1) Codex/Cursor cache (ако има)
#   2) vendor zip в repo: presentation/build/vendor/artifact-tool.zip
#   3) FAIL с инструкции

$ErrorActionPreference = "Stop"

$dstRoot = Join-Path $PSScriptRoot "node_modules\@oai"
$dst = Join-Path $dstRoot "artifact-tool"
$cacheSrc = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\@oai\artifact-tool"
$vendorZip = Join-Path $PSScriptRoot "vendor\artifact-tool.zip"

function Test-ArtifactTool([string]$Path) {
  return Test-Path (Join-Path $Path "package.json")
}

function Copy-ArtifactTool([string]$Source, [string]$Label) {
  if (-not (Test-ArtifactTool $Source)) {
    throw "Invalid artifact-tool at: $Source"
  }
  if (Test-Path $dst) {
    Remove-Item $dst -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $dstRoot | Out-Null
  Copy-Item -Recurse -Force $Source $dst
  $walnutSrc = Join-Path (Split-Path $Source -Parent) "walnut"
  if (Test-Path $walnutSrc) {
    Copy-Item -Recurse -Force $walnutSrc (Join-Path $dstRoot "walnut")
  }
  Write-Host "OK: $Label -> $dst"
}

function Expand-VendorZip {
  if (-not (Test-Path $vendorZip)) {
    throw "Vendor zip not found: $vendorZip"
  }
  $tmp = Join-Path $env:TEMP ("oss-assistant-artifact-tool-" + [guid]::NewGuid().ToString())
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  try {
    Expand-Archive -Path $vendorZip -DestinationPath $tmp -Force
    $extracted = Join-Path $tmp "artifact-tool"
    if (-not (Test-ArtifactTool $extracted)) {
      throw "artifact-tool/package.json missing inside vendor zip"
    }
    Copy-ArtifactTool $extracted "vendor zip"
  }
  finally {
    if (Test-Path $tmp) {
      Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

if (Test-ArtifactTool $dst) {
  Write-Host "OK: already installed at $dst"
  exit 0
}

if (Test-ArtifactTool $cacheSrc) {
  Copy-ArtifactTool $cacheSrc "Codex cache"
  exit 0
}

if (Test-Path $vendorZip) {
  Expand-VendorZip
  exit 0
}

Write-Host "FAIL: @oai/artifact-tool not found."
Write-Host ""
Write-Host "Опитай:"
Write-Host "  1) Codex/Cursor среда (cache: $cacheSrc)"
Write-Host "  2) Vendor zip в repo: $vendorZip"
Write-Host "  3) Копирай presentation/build/node_modules/@oai от колега"
Write-Host ""
Write-Host "Виж presentation/BUILD_RECOVERY.md"
exit 1
