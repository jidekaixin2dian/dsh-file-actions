# Compatibility entry point; one launcher owns process validation and isolation.
& (Join-Path $PSScriptRoot 'launch.ps1') @args
