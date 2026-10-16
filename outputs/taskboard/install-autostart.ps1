param([switch]$Uninstall, [switch]$NoStart)
$ErrorActionPreference = 'Stop'
# Runs watchdog.ps1 at every Windows logon so the board comes up after a reboot and returns after a crash.
# A per-user scheduled task needs no admin; when policy blocks it, a Startup-folder shortcut does the same job.
$taskboardTaskName = 'CasparTaskboardWatchdog'
$taskboardUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$taskboardWatchdog = Join-Path $PSScriptRoot 'watchdog.ps1'
$taskboardLauncher = Join-Path $PSScriptRoot 'watchdog.vbs'
$taskboardWscript = Join-Path $env:SystemRoot 'System32\wscript.exe'
$taskboardStartupLink = Join-Path ([Environment]::GetFolderPath('Startup')) '任務看板自動啟動.lnk'

if ($Uninstall) {
    if (Get-ScheduledTask -TaskName $taskboardTaskName -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $taskboardTaskName -Confirm:$false }
    if (Test-Path -LiteralPath $taskboardStartupLink) { Remove-Item -LiteralPath $taskboardStartupLink }
    Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($taskboardWatchdog) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
    Write-Output '已移除自動啟動與看門狗；看板服務本身維持原狀，要停止請執行 stop.ps1。'
    return
}

$taskboardMode = 'task'
try {
    $taskboardAction = New-ScheduledTaskAction -Execute $taskboardWscript -Argument ('"' + $taskboardLauncher + '"') -WorkingDirectory $PSScriptRoot
    $taskboardTrigger = New-ScheduledTaskTrigger -AtLogOn -User $taskboardUser
    $taskboardSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
    $taskboardPrincipal = New-ScheduledTaskPrincipal -UserId $taskboardUser -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $taskboardTaskName -Action $taskboardAction -Trigger $taskboardTrigger -Settings $taskboardSettings -Principal $taskboardPrincipal -Description '登入時啟動任務看板看門狗（watchdog.ps1），看板停止回應時自動重啟。' -Force | Out-Null
} catch {
    Write-Warning ('無法建立排程工作，改用「啟動」資料夾捷徑：' + $_.Exception.Message)
    $taskboardMode = 'startup'
    $taskboardLink = (New-Object -ComObject WScript.Shell).CreateShortcut($taskboardStartupLink)
    $taskboardLink.TargetPath = $taskboardWscript
    $taskboardLink.Arguments = '"' + $taskboardLauncher + '"'
    $taskboardLink.WorkingDirectory = $PSScriptRoot
    $taskboardLink.Description = '任務看板看門狗'
    $taskboardLink.Save()
}

if (-not $NoStart) {
    # The scheduled task runs detached from this shell; the watchdog's mutex makes a second launch a no-op.
    if ($taskboardMode -eq 'task') { Start-ScheduledTask -TaskName $taskboardTaskName }
    else { Start-Process -FilePath $taskboardWscript -ArgumentList ('"' + $taskboardLauncher + '"') -WorkingDirectory $PSScriptRoot }
}
Write-Output ($(if ($taskboardMode -eq 'task') { "已建立排程工作 $taskboardTaskName（登入時執行）" } else { "已建立啟動捷徑 $taskboardStartupLink" }))
