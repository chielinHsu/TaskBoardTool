$ErrorActionPreference = 'Stop'
try {
    & (Join-Path $PSScriptRoot 'start-app.ps1')
} catch {
    $taskboardLog = Join-Path $PSScriptRoot '.data\desktop-launch.log'
    New-Item -ItemType Directory -Path (Split-Path $taskboardLog) -Force | Out-Null
    ($_ | Out-String) | Set-Content -LiteralPath $taskboardLog -Encoding UTF8
    $taskboardShell = New-Object -ComObject WScript.Shell
    $taskboardShell.Popup("任務看板啟動失敗：$($_.Exception.Message)`n`n詳細紀錄：$taskboardLog", 0, 'Codex 任務看板', 16) | Out-Null
    exit 1
}
