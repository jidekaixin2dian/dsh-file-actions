# Optional full-Web smoke harness. npm run test:host is the automated suite.
[CmdletBinding()]
param(
  [ValidateRange(1024,65535)][int]$Port = 5497,
  [string]$DshHome = $env:DFA_HOME,
  [string]$DshCli = $env:DFA_DSH_CLI,
  [switch]$Stop,
  [switch]$CheckOnly,
  [ValidateRange(1,180)][int]$TimeoutSeconds = 60
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$runDir = Join-Path $PSScriptRoot 'run'
$stateFile = Join-Path $runDir 'instance.json'
$childScript = Join-Path $PSScriptRoot 'launch-child.ps1'
if (-not $DshHome) { $DshHome = Join-Path (Split-Path $PSScriptRoot -Parent) 'work/desktop-e2e-home' }
$DshHome = [IO.Path]::GetFullPath($DshHome)
$realHome = [IO.Path]::GetFullPath((Join-Path $env:USERPROFILE '.dsh'))
if ($DshHome.TrimEnd('\','/') -eq $realHome.TrimEnd('\','/')) { throw 'Use a separate DFA_HOME, never the production DSH home.' }
$state = if (Test-Path -LiteralPath $stateFile) { Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json } else { $null }
function Stop-OwnedInstance {
  if ($null -eq $state) { return }
  $process = Get-Process -Id $state.launcherPid -ErrorAction SilentlyContinue
  if ($null -eq $process) { return }
  $details = Get-CimInstance Win32_Process -Filter "ProcessId = $($state.launcherPid)"
  if ($process.StartTime.ToUniversalTime().Ticks.ToString() -ne $state.startTicks -or
      -not $details.CommandLine.Contains($childScript)) {
    throw 'Recorded process identity changed; refusing to stop it.'
  }
  & taskkill.exe /PID $state.launcherPid /T /F | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not stop the owned process tree.' }
}
if ($Stop) {
  Stop-OwnedInstance
  if (Test-Path -LiteralPath $stateFile) { Remove-Item -LiteralPath $stateFile }
  return
}
if (-not $DshCli) { $command = Get-Command dsh -ErrorAction SilentlyContinue; if ($command) { $DshCli = $command.Source } }
if (-not $DshCli -or -not (Test-Path -LiteralPath $DshCli -PathType Leaf)) { throw 'Set DFA_DSH_CLI to the official DSH CLI.' }
$profileDir = Join-Path $DshHome 'profiles/dfa-e2e'
if (-not (Test-Path -LiteralPath (Join-Path $profileDir 'package.json'))) {
  throw "Provision an isolated web profile at $profileDir first. This script never copies personal profiles."
}
if ($CheckOnly) { Write-Output "CheckOnly: $DshCli; isolated home $DshHome; profile dfa-e2e; port $Port"; return }
if ($state) { throw 'An instance record exists. Use -Stop to verify and stop its owner first.' }
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { throw "Port $Port is occupied; choose another port." }
New-Item -ItemType Directory -Path $runDir -Force | Out-Null
$log = Join-Path $runDir 'instance.log'
$err = Join-Path $runDir 'instance.err.log'
foreach ($file in @($log,$err)) { if (Test-Path -LiteralPath $file) { Move-Item -LiteralPath $file -Destination ($file + '.' + [guid]::NewGuid().ToString('N') + '.previous') } }
# Start-Process joins ArgumentList; quote path arguments without evaluating shell text.
foreach ($value in @($childScript,$DshHome,$DshCli)) { if ($value.Contains('"')) { throw 'Invalid quote in path.' } }
$process = Start-Process -FilePath (Get-Command pwsh).Source -ArgumentList @('-NoProfile','-File',('"' + $childScript + '"'),'-DshHome',('"' + $DshHome + '"'),'-DshCli',('"' + $DshCli + '"'),'-Port',"$Port") -WindowStyle Hidden -PassThru -RedirectStandardOutput $log -RedirectStandardError $err
$state = [ordered]@{ profile='dfa-e2e'; home=$DshHome; port=$Port; launcherPid=$process.Id; startTicks=$process.StartTime.ToUniversalTime().Ticks.ToString(); url=$null }
$state | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding utf8
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
try {
  while ((Get-Date) -lt $deadline) {
    $process.Refresh()
    if ($process.HasExited) { throw 'DSH exited before readiness; inspect run/instance*.log.' }
    $match = Select-String -LiteralPath $log -Pattern 'http://127\.0\.0\.1:[0-9]+/\?token=[A-Za-z0-9_-]+' | Select-Object -First 1
    if ($match) {
      $url = $match.Matches[0].Value
      try {
        $response = Invoke-WebRequest -Uri $url -NoProxy -TimeoutSec 2
        if ($response.StatusCode -eq 200) {
          $state.url = $url
          $state | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding utf8
          Write-Output "Ready on port $Port. Private launch URL is in run/instance.json."
          return
        }
      } catch { }
    }
    Start-Sleep -Milliseconds 250
  }
  throw 'DSH readiness timed out; inspect run/instance*.log.'
} catch {
  Stop-OwnedInstance
  if (Test-Path -LiteralPath $stateFile) { Remove-Item -LiteralPath $stateFile }
  throw
}
