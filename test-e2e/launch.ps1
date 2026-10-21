<#
.SYNOPSIS
  Launch an isolated DeepSeek Harness (DSH) web instance for e2e verification.

.DESCRIPTION
  Creates (once) the scratch profile `dfa-e2e` modelled on the shipped `web`
  profile, picks a free TCP port, boots `dsh --profile dfa-e2e web --port <p>
  --no-open`, and waits until the HTTP UI answers 200.

  It NEVER touches the user's running desktop instance (port 5401) or the
  `desktop` profile. Everything it owns lives in:
    - C:\Users\Aether\.dsh\profiles\dfa-e2e          (scratch profile)
    - <this folder>\run\                             (logs, pid/port state)

.PARAMETER Port
  Preferred port (default 5497). If busy, the next free port is used.

.PARAMETER Recreate
  Rebuild the scratch profile from the shipped `web` template.

.PARAMETER Stop
  Stop the scratch instance recorded in run\instance.json and exit.

.EXAMPLE
  pwsh -File .\launch.ps1
  pwsh -File .\launch.ps1 -Port 5510
  pwsh -File .\launch.ps1 -Stop
#>
[CmdletBinding()]
param(
  [int]$Port = 5497,
  [switch]$Recreate,
  [switch]$Stop,
  [int]$TimeoutSeconds = 120
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# ---------------------------------------------------------------- constants
$DshHome    = Join-Path $env:USERPROFILE '.dsh'
$Profiles   = Join-Path $DshHome 'profiles'
$ProfileName = 'dfa-e2e'
$ProfileDir = Join-Path $Profiles $ProfileName
$TemplateDir = Join-Path $Profiles 'web'
$DshCli     = 'C:\Users\Aether\AppData\Local\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
$Here       = Split-Path -Parent $MyInvocation.MyCommand.Path
$RunDir     = Join-Path $Here 'run'
$StateFile  = Join-Path $RunDir 'instance.json'
$LogFile    = Join-Path $RunDir 'instance.log'

function Write-Step($msg) { Write-Host "[launch] $msg" -ForegroundColor Cyan }
function Write-Warn2($msg) { Write-Host "[launch] $msg" -ForegroundColor Yellow }

New-Item -ItemType Directory -Force -Path $RunDir | Out-Null

# ---------------------------------------------------------------- stop mode
function Get-State {
  if (Test-Path -LiteralPath $StateFile) {
    try { return Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json } catch { return $null }
  }
  return $null
}

function Test-UrlOk([string]$url) {
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
    return ($r.StatusCode -eq 200)
  } catch { return $false }
}

function Stop-Instance {
  $state = Get-State
  if ($null -eq $state) { Write-Step 'no instance recorded'; return }
  # Kill whatever actually listens on our recorded port, plus the launcher pid.
  foreach ($procId in @($state.portPid, $state.launcherPid)) {
    if ($null -eq $procId -or $procId -le 0) { continue }
    $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if ($null -ne $p) {
      Write-Step "stopping pid $procId ($($p.ProcessName))"
      try { Stop-Process -Id $procId -Force -ErrorAction Stop } catch { Write-Warn2 "pid $procId already gone" }
    }
  }
  # Belt and braces: anything still listening on our port.
  $listener = Get-NetTCPConnection -LocalPort ([int]$state.port) -State Listen -ErrorAction SilentlyContinue
  foreach ($l in $listener) {
    try { Stop-Process -Id $l.OwningProcess -Force -ErrorAction Stop; Write-Step "stopped port owner $($l.OwningProcess)" } catch { }
  }
  Remove-Item -LiteralPath $StateFile -Force -ErrorAction SilentlyContinue
  Write-Step 'stopped'
}

if ($Stop) { Stop-Instance; return }

# ---------------------------------------------------------------- guard rail
if ($Port -eq 5401) { throw 'refusing to manage port 5401 (the user''s desktop instance)' }

# ---------------------------------------------------------------- profile
function Initialize-Profile {
  if ((Test-Path -LiteralPath $ProfileDir) -and -not $Recreate) {
    Write-Step "profile exists: $ProfileDir"
    return
  }
  if (Test-Path -LiteralPath $ProfileDir) {
    Write-Step "recreating profile (keeping node_modules): $ProfileDir"
    foreach ($f in 'cordis.yml', 'cordis.patch.yml', 'package.json', 'pnpm-workspace.yaml') {
      $src = Join-Path $TemplateDir $f
      if (Test-Path -LiteralPath $src) { Copy-Item -LiteralPath $src -Destination (Join-Path $ProfileDir $f) -Force }
    }
    # keep package.json name distinct so pnpm state is unambiguous
    $pkgPath = Join-Path $ProfileDir 'package.json'
    $pkg = Get-Content -LiteralPath $pkgPath -Raw | ConvertFrom-Json
    $pkg.name = "dsh-profile-$ProfileName"
    $pkg | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $pkgPath -Encoding utf8
    return
  }
  Write-Step "creating profile from '$TemplateDir' -> $ProfileDir"
  New-Item -ItemType Directory -Force -Path $ProfileDir | Out-Null
  foreach ($f in 'cordis.yml', 'cordis.patch.yml', 'package.json', 'pnpm-workspace.yaml') {
    $src = Join-Path $TemplateDir $f
    if (-not (Test-Path -LiteralPath $src)) { throw "template file missing: $src" }
    Copy-Item -LiteralPath $src -Destination (Join-Path $ProfileDir $f) -Force
  }
  $pkgPath = Join-Path $ProfileDir 'package.json'
  $pkg = Get-Content -LiteralPath $pkgPath -Raw | ConvertFrom-Json
  $pkg.name = "dsh-profile-$ProfileName"
  $pkg | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $pkgPath -Encoding utf8
}

function Get-FreePort([int]$preferred) {
  for ($p = $preferred; $p -lt ($preferred + 200); $p++) {
    if ($p -eq 5401) { continue }
    $busy = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
    if (-not $busy) { return $p }
  }
  throw "no free port found starting at $preferred"
}

Initialize-Profile

if (-not (Test-Path -LiteralPath $DshCli)) { throw "dsh CLI not found: $DshCli" }

# ---------------------------------------------------------------- reuse
$state = Get-State
if ($null -ne $state) {
  $probeUrl = if ($state.PSObject.Properties['url'] -and $state.url) { $state.url } else { "http://127.0.0.1:$($state.port)/" }
  if (Test-UrlOk $probeUrl) {
    Write-Step "instance already up on port $($state.port) (pid $($state.portPid))"
    Write-Output "PORT=$($state.port)"
    Write-Output "URL=$($state.url)"
    return
  }
  Write-Step 'recorded instance is not answering; restarting it'
  Stop-Instance
}

# ---------------------------------------------------------------- start
$usePort = Get-FreePort $Port
Write-Step "starting dsh --profile $ProfileName --port $usePort --no-open"

Remove-Item -LiteralPath $LogFile -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath "$LogFile.err" -Force -ErrorAction SilentlyContinue

# A plain Start-Process child inherits this shell's stdio handles, which keeps
# the caller's pipe open forever (the harness would hang). Win32_Process.Create
# starts the server fully detached, and the .cmd shim owns its own redirection.
$shim = Join-Path $RunDir 'start.cmd'
$shimBody = @(
  '@echo off',
  ('"{0}" --profile {1} --port {2} --no-open > "{3}" 2> "{4}"' -f $DshCli, $ProfileName, $usePort, $LogFile, "$LogFile.err")
) -join "`r`n"
Set-Content -LiteralPath $shim -Value $shimBody -Encoding ascii

$launcherPid = 0
try {
  $created = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine      = ('cmd.exe /c "{0}"' -f $shim)
    CurrentDirectory = $Here
  } -ErrorAction Stop
  if ($created.ReturnValue -eq 0) { $launcherPid = [int]$created.ProcessId }
  else { Write-Warn2 "Win32_Process.Create returned $($created.ReturnValue)" }
} catch {
  Write-Warn2 "detached launch failed ($($_.Exception.Message)); falling back to Start-Process"
}

if ($launcherPid -eq 0) {
  $proc = Start-Process -FilePath $DshCli -ArgumentList @('--profile', $ProfileName, '--port', "$usePort", '--no-open') `
    -WorkingDirectory $Here -RedirectStandardOutput $LogFile -RedirectStandardError "$LogFile.err" `
    -WindowStyle Hidden -PassThru
  $launcherPid = $proc.Id
}
Write-Step "launcher pid $launcherPid, log $LogFile"

# The web app prints `dsh web: http://127.0.0.1:<port>/?token=<token>` once it
# is listening. `/` without the token is refused, so scrape the token line.
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$url = $null
while ((Get-Date) -lt $deadline) {
  if (Test-Path -LiteralPath $LogFile) {
    $m = Select-String -LiteralPath $LogFile -Pattern 'dsh web:\s*(\S+)' -ErrorAction SilentlyContinue |
         Select-Object -First 1
    if ($null -ne $m) { $url = $m.Matches[0].Groups[1].Value.Trim(); break }
  }
  $listening = Get-NetTCPConnection -LocalPort $usePort -State Listen -ErrorAction SilentlyContinue
  if (-not $listening -and $null -ne (Get-Process -Id $launcherPid -ErrorAction SilentlyContinue) -eq $false) { break }
  Start-Sleep -Milliseconds 250
}

$ok = $false
if ($null -ne $url) {
  while ((Get-Date) -lt $deadline) {
    if (Test-UrlOk $url) { $ok = $true; break }
    Start-Sleep -Milliseconds 250
  }
}

if (-not $ok) {
  Write-Warn2 "instance did not answer 200 within ${TimeoutSeconds}s; tail of log:"
  if (Test-Path -LiteralPath $LogFile) { Get-Content -LiteralPath $LogFile -Tail 40 | ForEach-Object { Write-Host "  $_" } }
  if (Test-Path -LiteralPath "$LogFile.err") { Get-Content -LiteralPath "$LogFile.err" -Tail 40 | ForEach-Object { Write-Host "  ! $_" } }
  throw "launch failed on port $usePort"
}

$listener = Get-NetTCPConnection -LocalPort $usePort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
$portPid = if ($null -ne $listener) { [int]$listener.OwningProcess } else { $launcherPid }

$record = [ordered]@{
  profile     = $ProfileName
  port        = $usePort
  url         = $url
  launcherPid = $launcherPid
  portPid     = $portPid
  startedAt   = (Get-Date).ToString('o')
  log         = $LogFile
}
$record | ConvertTo-Json | Set-Content -LiteralPath $StateFile -Encoding utf8

Write-Step "UP  $url   (profile=$ProfileName port=$usePort pid=$portPid)"
Write-Output "PORT=$usePort"
Write-Output "URL=$url"
