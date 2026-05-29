Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptPath = Join-Path $PSScriptRoot 'CodexSidebarKeeper.ps1'
$scriptPathPattern = [regex]::Escape($scriptPath)
$scriptInvocationPattern = "(?i)-File\s+[`"']?$scriptPathPattern[`"']?"
$processes = Get-CimInstance Win32_Process |
    Where-Object { $_.CommandLine -and $_.CommandLine -match $scriptInvocationPattern }

if (-not $processes) {
    Write-Host 'Codex Sidebar Keeper is not running.'
    return
}

foreach ($process in $processes) {
    Invoke-CimMethod -InputObject $process -MethodName Terminate | Out-Null
}

Write-Host 'Stopped Codex Sidebar Keeper.'
