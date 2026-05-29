param(
    [ValidateSet('CtrlB', 'CtrlShiftS')]
    [string]$Shortcut = 'CtrlB',

    [string]$WindowTitlePattern = 'Codex'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptPath = Join-Path $PSScriptRoot 'CodexSidebarKeeper.ps1'
$scriptPathPattern = [regex]::Escape($scriptPath)
$scriptInvocationPattern = "(?i)-File\s+[`"']?$scriptPathPattern[`"']?"
$existing = Get-CimInstance Win32_Process |
    Where-Object { $_.CommandLine -and $_.CommandLine -match $scriptInvocationPattern }

if ($existing) {
    Write-Host 'Codex Sidebar Keeper is already running.'
    return
}

$arguments = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-STA',
    '-File', "`"$scriptPath`"",
    '-Shortcut', $Shortcut,
    '-WindowTitlePattern', "`"$WindowTitlePattern`""
)

Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -WindowStyle Hidden
Write-Host "Started Codex Sidebar Keeper. Press Ctrl+Alt+S to reopen the sidebar, or Ctrl+Alt+Q to stop it."
