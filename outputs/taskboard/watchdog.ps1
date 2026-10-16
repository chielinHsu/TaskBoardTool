param([int]$Port = 47824, [int]$IntervalSeconds = 20)
$ErrorActionPreference = 'Stop'
# Keeps the loopback board alive: one watcher per port, restarting the service through start.ps1 when it stops answering.
# Create .data\watchdog.pause to hold restarts (e.g. after an intentional stop.ps1); delete it to resume.
$taskboardMutex = New-Object Threading.Mutex($false, ('Local\CasparTaskboardWatchdog-' + $Port))
$taskboardOwnsLock = $false
try { $taskboardOwnsLock = $taskboardMutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $taskboardOwnsLock = $true }
if (-not $taskboardOwnsLock) { $taskboardMutex.Dispose(); return }
$taskboardData = Join-Path $PSScriptRoot '.data'
New-Item -ItemType Directory -Path $taskboardData -Force | Out-Null
$taskboardLog = Join-Path $taskboardData 'watchdog.log'
$taskboardPause = Join-Path $taskboardData 'watchdog.pause'
$taskboardUrl = "http://127.0.0.1:$Port"

function Write-TaskboardLog([string]$Message) {
    try {
        if ((Test-Path -LiteralPath $taskboardLog) -and (Get-Item -LiteralPath $taskboardLog).Length -gt 256KB) {
            Move-Item -LiteralPath $taskboardLog -Destination ($taskboardLog + '.1') -Force
        }
        Add-Content -LiteralPath $taskboardLog -Value ((Get-Date -Format 's') + ' ' + $Message) -Encoding UTF8
    } catch { }
}

function Test-TaskboardAlive {
    try { return (Invoke-WebRequest -Uri $taskboardUrl -TimeoutSec 5 -UseBasicParsing).Content -like '*content="caspar-taskboard"*' } catch { return $false }
}

Write-TaskboardLog "watchdog started (pid $PID, port $Port)"
# Start at one miss so a board that is down at logon comes up on the first check.
$taskboardMisses = 1
try {
    while ($true) {
        if ((Test-Path -LiteralPath $taskboardPause) -or (Test-TaskboardAlive)) { $taskboardMisses = 0 }
        else {
            $taskboardMisses++
            # Two misses in a row: one slow answer under load is not an outage.
            if ($taskboardMisses -ge 2) {
                Write-TaskboardLog 'board not answering; restarting'
                try { & (Join-Path $PSScriptRoot 'start.ps1') -Port $Port -NoBrowser | Out-Null; Write-TaskboardLog 'board restarted' }
                catch { Write-TaskboardLog ('restart failed: ' + $_.Exception.Message) }
                $taskboardMisses = 0
            }
        }
        Start-Sleep -Seconds $IntervalSeconds
    }
} finally {
    $taskboardMutex.ReleaseMutex()
    $taskboardMutex.Dispose()
}
