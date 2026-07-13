# Възстановява @oai/artifact-tool за presentation build (Windows + Codex).
# Пусни от root на repo-то:  powershell -File presentation/build/setup-deps.ps1

$ErrorActionPreference = "Stop"

$src = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\@oai"
$dst = Join-Path $PSScriptRoot "node_modules\@oai"

if (-not (Test-Path (Join-Path $src "artifact-tool"))) {
  Write-Host "FAIL: Codex cache not found at:`n  $src"
  Write-Host ""
  Write-Host "Трябва Codex/Cursor среда с codex-primary-runtime."
  Write-Host "Алтернатива: копирай presentation/build/node_modules/@oai от колега."
  exit 1
}

New-Item -ItemType Directory -Force -Path $dst | Out-Null
Copy-Item -Recurse -Force (Join-Path $src "artifact-tool") (Join-Path $dst "artifact-tool")
if (Test-Path (Join-Path $src "walnut")) {
  Copy-Item -Recurse -Force (Join-Path $src "walnut") (Join-Path $dst "walnut")
}

Write-Host "OK: copied @oai/artifact-tool -> $dst"
Write-Host "Next: node presentation/build/build.mjs  (виж presentation/BUILD_RECOVERY.md)"
