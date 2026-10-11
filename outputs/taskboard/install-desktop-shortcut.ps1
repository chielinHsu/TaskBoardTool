param([string]$DesktopDirectory = [Environment]::GetFolderPath('Desktop'))
$ErrorActionPreference = 'Stop'
$taskboardDesktop = [IO.Path]::GetFullPath($DesktopDirectory)
if (-not (Test-Path -LiteralPath $taskboardDesktop -PathType Container)) { throw 'Desktop directory not found.' }
$taskboardLinkPath = Join-Path $taskboardDesktop 'Codex.lnk'
$taskboardShell = New-Object -ComObject WScript.Shell
$taskboardLauncher = Join-Path $PSScriptRoot 'launch-app.vbs'
$taskboardBackup = Join-Path $PSScriptRoot '.data\desktop-shortcut-backup'
if (Test-Path -LiteralPath $taskboardLinkPath) {
    $taskboardExisting = $taskboardShell.CreateShortcut($taskboardLinkPath)
    if ($taskboardExisting.Arguments -ne ('"' + $taskboardLauncher + '"')) {
        New-Item -ItemType Directory -Path $taskboardBackup -Force | Out-Null
        $taskboardBackupFile = Join-Path $taskboardBackup ('Codex-' + [Guid]::NewGuid().ToString() + '.lnk')
        Copy-Item -LiteralPath $taskboardLinkPath -Destination $taskboardBackupFile
        Write-Output "Original shortcut preserved at $taskboardBackupFile"
    }
}
$taskboardPackage = Get-AppxPackage -Name OpenAI.Codex | Select-Object -First 1
if (-not $taskboardPackage) { throw 'Microsoft Store Codex App is required.' }
$taskboardLink = $taskboardShell.CreateShortcut($taskboardLinkPath)
$taskboardLink.TargetPath = Join-Path $env:SystemRoot 'System32\wscript.exe'
$taskboardLink.Arguments = '"' + $taskboardLauncher + '"'
$taskboardLink.WorkingDirectory = $PSScriptRoot
$taskboardLink.IconLocation = (Join-Path $taskboardPackage.InstallLocation 'app\ChatGPT.exe') + ',0'
$taskboardLink.Description = 'Codex App + 任務看板（自動啟動本機看板服務）'
$taskboardLink.Save()
Write-Output "Installed $taskboardLinkPath"
