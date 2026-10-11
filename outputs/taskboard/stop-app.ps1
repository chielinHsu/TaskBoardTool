# Removes only our runtime entry and panel; the Codex window and board data remain.
$ErrorActionPreference='Stop'
$taskboardState=Join-Path $PSScriptRoot '.data'
$taskboardRuntimePath=Join-Path $taskboardState 'app-integration.json'
$taskboardHelper=@(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains((Join-Path $PSScriptRoot 'app-injector.mjs')) -and $_.CommandLine.Contains($taskboardRuntimePath) })
if(-not $taskboardHelper.Count){
 if(Test-Path -LiteralPath $taskboardRuntimePath){
  $taskboardConfig=Get-Content -LiteralPath $taskboardRuntimePath -Raw -Encoding UTF8 | ConvertFrom-Json
  $taskboardListener=Get-NetTCPConnection -LocalPort $taskboardConfig.cdpPort -State Listen -ErrorAction SilentlyContinue
  if($taskboardListener){
   $taskboardOwner=Get-CimInstance Win32_Process -Filter "ProcessId=$($taskboardListener.OwningProcess)"
   if($taskboardOwner.Name -ne 'ChatGPT.exe' -or -not $taskboardOwner.CommandLine.Contains($taskboardConfig.profile)){throw 'Dedicated App profile mismatch.'}
   $taskboardNode=Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
   & $taskboardNode (Join-Path $PSScriptRoot 'app-remove.mjs') $taskboardRuntimePath
   if($LASTEXITCODE -ne 0){throw 'Orphaned App integration cleanup failed.'}
  }
 }
 @{phase='stopped';updatedAt=[DateTimeOffset]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskboardState 'app-status.json') -Encoding UTF8
 Write-Output 'Stopped integration was cleaned up.';return
}
Set-Content -LiteralPath (Join-Path $taskboardState 'app-stop') -Value 'stop' -Encoding ASCII
for($taskboardAttempt=0;$taskboardAttempt -lt 30;$taskboardAttempt++) {
  Start-Sleep -Milliseconds 500
  $taskboardStatusPath=Join-Path $taskboardState 'app-status.json'
  if(Test-Path -LiteralPath $taskboardStatusPath) {
    $taskboardStatus=Get-Content -LiteralPath $taskboardStatusPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if($taskboardStatus.phase -eq 'stopped'){Write-Output 'Taskboard App integration removed. Close the dedicated window to close its debug port.';return}
  }
}
throw 'Integration cleanup has not finished. Check .data/app-status.json.'
