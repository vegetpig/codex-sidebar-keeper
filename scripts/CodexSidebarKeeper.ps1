param(
    [ValidateSet('CtrlB', 'CtrlShiftS')]
    [string]$Shortcut = 'CtrlB',

    [string]$WindowTitlePattern = 'Codex',

    [int]$PollMilliseconds = 70
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;

public static class KeyboardState {
    [DllImport("user32.dll")]
    public static extern short GetAsyncKeyState(int vKey);
}
'@

$shell = New-Object -ComObject WScript.Shell

function Test-KeyDown {
    param([int]$VirtualKey)
    return ([KeyboardState]::GetAsyncKeyState($VirtualKey) -band 0x8000) -ne 0
}

function Get-CodexProcess {
    $matches = Get-Process |
        Where-Object { $_.MainWindowTitle -and $_.MainWindowTitle -match $WindowTitlePattern } |
        Sort-Object StartTime -Descending

    return $matches | Select-Object -First 1
}

function Invoke-SidebarShortcut {
    $process = Get-CodexProcess
    if (-not $process) {
        [System.Media.SystemSounds]::Exclamation.Play()
        return
    }

    [void]$shell.AppActivate($process.Id)
    Start-Sleep -Milliseconds 120

    if ($Shortcut -eq 'CtrlShiftS') {
        [System.Windows.Forms.SendKeys]::SendWait('^+s')
    }
    else {
        [System.Windows.Forms.SendKeys]::SendWait('^b')
    }
}

$ctrl = 0x11
$alt = 0x12
$s = 0x53
$q = 0x51
$lastSidebarChord = $false
$lastQuitChord = $false

Write-Host "Codex Sidebar Keeper is running."
Write-Host "Ctrl+Alt+S: reopen/toggle sidebar using $Shortcut."
Write-Host "Ctrl+Alt+Q: stop."

while ($true) {
    $sidebarChord = (Test-KeyDown $ctrl) -and (Test-KeyDown $alt) -and (Test-KeyDown $s)
    $quitChord = (Test-KeyDown $ctrl) -and (Test-KeyDown $alt) -and (Test-KeyDown $q)

    if ($sidebarChord -and -not $lastSidebarChord) {
        Invoke-SidebarShortcut
    }

    if ($quitChord -and -not $lastQuitChord) {
        break
    }

    $lastSidebarChord = $sidebarChord
    $lastQuitChord = $quitChord
    Start-Sleep -Milliseconds $PollMilliseconds
}

Write-Host "Codex Sidebar Keeper stopped."
