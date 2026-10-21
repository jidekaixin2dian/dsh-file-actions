#!/usr/bin/env pwsh
# Start a scratch DSH Web instance for this plugin and print its token URL.
#
# The desktop app keeps its profile locked, so verification always runs against a
# throwaway profile on its own port. Nothing here touches the desktop profile.
#
# Usage:
#   pwsh -File .\start-instance.ps1                 # port 5499, profile dfa-check
#   pwsh -File .\start-instance.ps1 -Port 5511
#   pwsh -File .\start-instance.ps1 -Stop           # stop whatever listens on the port
param(
  [int]$Port = 5499,
  [string]$Profile = 'dfa-check',
  [switch]$Stop,
  [switch]$NoInstall
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $PSScriptRoot
$projectDir = Split-Path -Parent $here
$dshHome = Join-Path $env:USERPROFILE '.dsh'
$profileDir = Join-Path $dshHome "profiles\$Profile"
$dsh = 'C:\Users\Aether\AppData\Local\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'

if ($Stop) {
  $conn = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
  if ($conn) {
    Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
    Write-Host "已停止端口 $Port 上的实例"
  } else {
    Write-Host "端口 $Port 没有监听进程"
  }
  return
}

if (-not (Test-Path -LiteralPath $dsh)) { throw "缺少 DSH CLI: $dsh" }

if (-not (Test-Path -LiteralPath $profileDir)) {
  New-Item -ItemType Directory -Force -Path $profileDir | Out-Null
  @'
[]
'@ | Set-Content -LiteralPath (Join-Path $profileDir 'cordis.yml') -Encoding utf8
  @'
[]
'@ | Set-Content -LiteralPath (Join-Path $profileDir 'cordis.patch.yml') -Encoding utf8
  @'
packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false
'@ | Set-Content -LiteralPath (Join-Path $profileDir 'pnpm-workspace.yaml') -Encoding utf8
  @"
{
  "name": "dsh-profile-$Profile",
  "private": true,
  "dependencies": {},
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "@jidekaixin2dian/dsh-file-actions"
      ]
    }
  }
}
"@ | Set-Content -LiteralPath (Join-Path $profileDir 'package.json') -Encoding utf8
  Write-Host "已创建 scratch profile: $profileDir"
}

if (-not $NoInstall) {
  & pwsh -NoProfile -File (Join-Path $projectDir 'scripts\reinstall.ps1') -Profile $Profile -Force
}

$existing = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
if ($existing) { throw "端口 $Port 已被占用（PID $($existing.OwningProcess)），换 -Port 或先 -Stop" }

$log = Join-Path $here "instance-$Port.log"
Remove-Item -LiteralPath $log -ErrorAction SilentlyContinue
Start-Process -FilePath 'pwsh' -ArgumentList @(
  '-NoProfile',
  '-Command',
  "& '$dsh' --profile $Profile --port $Port --no-open *> '$log'"
) -WindowStyle Hidden | Out-Null

$token = $null
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Milliseconds 500
  if (Test-Path -LiteralPath $log) {
    $match = Select-String -LiteralPath $log -Pattern 'token=([A-Za-z0-9_-]+)' | Select-Object -First 1
    if ($match) { $token = $match.Matches.Groups[1].Value; break }
  }
}
if (-not $token) { throw "实例没有在 30 秒内打印 token，见 $log" }

Set-Content -LiteralPath (Join-Path $here 'token.txt') -Value $token -NoNewline
Write-Host "实例已启动: http://127.0.0.1:$Port/?token=$token"
Write-Host "token 已写入 $(Join-Path $here 'token.txt')"
Write-Host "下一步: node .\self-check.mjs (自动读取 token.txt)"
