#!/usr/bin/env pwsh
# Reinstall this plugin from its source directory into a DSH profile.
#
# Why a script: the desktop host owns the profile's package.json, so
# `dsh plugin ... add` is refused while the app runs, and a stale
# node_modules copy is the usual reason a change "does nothing".
#
# Usage:
#   pwsh -File .\scripts\reinstall.ps1              # install into the desktop profile
#   pwsh -File .\scripts\reinstall.ps1 -CheckOnly   # print what would run, change nothing
#   pwsh -File .\scripts\reinstall.ps1 -Profile dfa-e2e
#
param(
  [string]$Profile = 'desktop',
  [switch]$CheckOnly,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

$projectDir = Split-Path -Parent $PSScriptRoot
$dshHome = Join-Path $env:USERPROFILE '.dsh'
$profileDir = Join-Path $dshHome "profiles\$Profile"
$node = Join-Path $dshHome 'dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
$pnpm = Join-Path $dshHome 'dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.cjs'

foreach ($p in @($projectDir, $profileDir, $node, $pnpm)) {
  if (-not (Test-Path -LiteralPath $p)) { throw "缺少路径: $p" }
}

$pkg = Get-Content -LiteralPath (Join-Path $projectDir 'package.json') -Raw | ConvertFrom-Json
if (-not $pkg.dsh.bundle.patch) { throw "package.json 没有 dsh.bundle.patch，确认这是 DSH 插件目录: $projectDir" }

# pnpm accepts a forward-slash absolute path behind the file: protocol.
$spec = 'file:' + ($projectDir -replace '\\', '/')
$display = @(
  "profile : $profileDir",
  "project : $projectDir",
  "package : $($pkg.name)@$($pkg.version)",
  "command : `"$node`" `"$pnpm`" add `"$spec`"  (cwd: $profileDir)"
)

if ($CheckOnly) {
  $display | ForEach-Object { Write-Host $_ }
  Write-Host 'CheckOnly: nothing was changed.'
  return
}

$running = Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue
if ($running -and -not $Force) {
  $ids = ($running | ForEach-Object { $_.Id }) -join ', '
  throw "DSH 正在运行（PID $ids）。先完全退出桌面端再重装，或加 -Force 自行承担热写风险。"
}

$display | ForEach-Object { Write-Host $_ }
Push-Location $profileDir
try {
  & $node $pnpm add $spec
  if ($LASTEXITCODE -ne 0) { throw "pnpm add 失败，退出码 $LASTEXITCODE" }
} finally {
  Pop-Location
}

$installed = Join-Path $profileDir "node_modules\$($pkg.name)\package.json"
if (-not (Test-Path -LiteralPath $installed)) { throw "安装后找不到 $installed" }
$got = (Get-Content -LiteralPath $installed -Raw | ConvertFrom-Json).version

# A bare `pnpm add` only adds the dependency; the bundle patch applies only to
# rows the profile lists under dsh.profile.bundles. Add the row here instead of
# relying on `dsh plugin add`, which the running host refuses to write.
$profilePkgPath = Join-Path $profileDir 'package.json'
$profilePkg = Get-Content -LiteralPath $profilePkgPath -Raw | ConvertFrom-Json
$bundles = @()
if ($profilePkg.dsh -and $profilePkg.dsh.profile -and $profilePkg.dsh.profile.bundles) {
  $bundles = @($profilePkg.dsh.profile.bundles)
}
if ($bundles -notcontains $pkg.name) {
  Copy-Item -LiteralPath $profilePkgPath -Destination "$profilePkgPath.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')-add-file-actions"
  $next = @($bundles) + $pkg.name
  $profilePkg.dsh.profile | Add-Member -NotePropertyName bundles -NotePropertyValue $next -Force
  $profilePkg | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $profilePkgPath -Encoding utf8
  Write-Host "已在 dsh.profile.bundles 追加 $($pkg.name)"
}

Write-Host "已安装 $($pkg.name)@$got（源码版本 $($pkg.version)）"
Write-Host '下一步：重开 DSH，在聊天里右键任意蓝色文件名验证。'
