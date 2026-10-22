# Install through the official CLI so profile locks and bundle registration apply.
[CmdletBinding()]
param(
  [ValidatePattern('^[a-zA-Z0-9_-]+$')][string]$Profile = 'desktop',
  [string]$DshHome = $env:DSH_HOME,
  [string]$DshCli = $env:DFA_DSH_CLI,
  [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
if (-not $DshHome) { $DshHome = Join-Path $env:USERPROFILE '.dsh' }
$DshHome = [IO.Path]::GetFullPath($DshHome)
if (-not $DshCli) {
  $command = Get-Command dsh -ErrorAction SilentlyContinue
  if ($command) { $DshCli = $command.Source }
}
if (-not $DshCli) { throw 'Set -DshCli or DFA_DSH_CLI to the official DSH CLI.' }
if (-not (Test-Path -LiteralPath $DshCli -PathType Leaf)) { throw "DSH CLI missing: $DshCli" }
$spec = 'file:' + ($projectDir -replace '\\', '/')
Write-Output "Profile: $Profile; DSH_HOME: $DshHome; source: $projectDir"
if ($CheckOnly) { Write-Output 'CheckOnly: no changes.'; return }
$previousHome = $env:DSH_HOME
try {
  $env:DSH_HOME = $DshHome
  & $DshCli plugin --profile $Profile add $spec
  if ($LASTEXITCODE -ne 0) { throw "Official CLI install failed ($LASTEXITCODE); close DSH if this profile is locked." }
} finally { $env:DSH_HOME = $previousHome }
Write-Output 'Installed. Reopen DSH to load both halves.'
