param([string]$DshHome, [string]$DshCli, [int]$Port)
$ErrorActionPreference = 'Stop'
$env:DSH_HOME = $DshHome
$env:DSH_TELEMETRY_DISABLED = '1'
& $DshCli --profile dfa-e2e --port $Port --no-open
exit $LASTEXITCODE
