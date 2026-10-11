param([int]$Port=47824, [int]$DebugPort=9232, [string]$DataDirectory)
$ErrorActionPreference='Stop'
# Double-clicks must not race to launch duplicate services/helpers.
$taskboardLockBytes=[Text.Encoding]::UTF8.GetBytes(($PSScriptRoot.ToLowerInvariant()+':'+$DebugPort))
$taskboardHasher=[Security.Cryptography.SHA256]::Create()
try { $taskboardLockId=([BitConverter]::ToString($taskboardHasher.ComputeHash($taskboardLockBytes))).Replace('-','') } finally { $taskboardHasher.Dispose() }
$taskboardMutex=New-Object Threading.Mutex($false,('Local\CasparTaskboard-'+$taskboardLockId))
$taskboardOwnsLock=$false
try {
try { $taskboardOwnsLock=$taskboardMutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $taskboardOwnsLock=$true }
if(-not $taskboardOwnsLock){Write-Output 'Taskboard startup is already in progress.';return}
$taskboardRoot=$PSScriptRoot
$taskboardState=Join-Path $taskboardRoot '.data'
New-Item -ItemType Directory -Path $taskboardState -Force | Out-Null
$taskboardRuntimePath=Join-Path $taskboardState 'app-integration.json'
$taskboardProfile=Join-Path $taskboardState 'app-profile'
if(Test-Path -LiteralPath $taskboardRuntimePath) {
  $taskboardPrior=Get-Content -LiteralPath $taskboardRuntimePath -Raw -Encoding UTF8 | ConvertFrom-Json
  if($taskboardPrior.profile){$taskboardProfile=[IO.Path]::GetFullPath($taskboardPrior.profile)}
}
$taskboardStatusPath=Join-Path $taskboardState 'app-status.json'
$taskboardStopPath=Join-Path $taskboardState 'app-stop'
$taskboardShowPath=Join-Path $taskboardState 'app-show'
$taskboardNode=Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
if(-not(Test-Path -LiteralPath $taskboardNode)){ $taskboardNode=(Get-Command node -ErrorAction Stop).Source }

# Validate CDP ownership before reusing a port. Never attach to the user's ordinary App.
$taskboardProcesses=@(Get-CimInstance Win32_Process -Filter "Name='ChatGPT.exe'" | Where-Object {
  $_.CommandLine -like '*--user-data-dir*' -and $_.CommandLine.Contains($taskboardProfile) -and $_.CommandLine -notlike '*--type=*'
})
$taskboardListener=Get-NetTCPConnection -LocalPort $DebugPort -State Listen -ErrorAction SilentlyContinue
if($taskboardListener -and -not($taskboardProcesses.ProcessId -contains $taskboardListener.OwningProcess)) { throw "Debug port $DebugPort belongs to another process. Choose another DebugPort." }
& (Join-Path $taskboardRoot 'start.ps1') -Port $Port -NoBrowser -DataDirectory $DataDirectory | Out-Null
$taskboardAppPid=0
if($taskboardProcesses.Count){$taskboardAppPid=$taskboardProcesses[0].ProcessId}
  # Reactivate the packaged App when its dedicated window already exists too.
  $taskboardPackage=Get-AppxPackage -Name OpenAI.Codex | Select-Object -First 1
  if(-not $taskboardPackage){throw 'Microsoft Store Codex App is required.'}
  $taskboardManifest=$taskboardPackage | Get-AppxPackageManifest
  $taskboardApplication=@($taskboardManifest.Package.Applications.Application) | Where-Object {([string]$_.Executable).Replace('\','/') -eq 'app/ChatGPT.exe'} | Select-Object -First 1
  if(-not $taskboardApplication){throw 'Codex App manifest entry not found.'}
  # Windows packaged App activation follows the documented COM interface used by dashi-taskboard.
  if(-not('CasparBoard.AppActivator' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace CasparBoard {
 [ComImport, Guid("2E941141-7F97-4756-BA1D-9DECDE894A3D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
 interface IActivationManager {
  [PreserveSig] int ActivateApplication([MarshalAs(UnmanagedType.LPWStr)] string id, [MarshalAs(UnmanagedType.LPWStr)] string args, uint options, out uint processId);
 }
 [ComImport, Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")] class ActivationManager {}
 public static class AppActivator {
  public static uint Activate(string id,string args) {
   var manager=(IActivationManager)new ActivationManager();
   try {uint pid; int result=manager.ActivateApplication(id,args,0,out pid); if(result<0) Marshal.ThrowExceptionForHR(result); return pid;}
   finally {Marshal.FinalReleaseComObject(manager);}
  }
 }
}
'@
  }
  $taskboardAppId=$taskboardPackage.PackageFamilyName+'!'+$taskboardApplication.Id
  $taskboardArgs='--user-data-dir="'+$taskboardProfile+'" --remote-debugging-address=127.0.0.1 --remote-debugging-port='+$DebugPort+' --remote-allow-origins=http://127.0.0.1:'+$DebugPort
  $taskboardAppPid=[CasparBoard.AppActivator]::Activate($taskboardAppId,$taskboardArgs)
$taskboardConnected=$false
for($taskboardAttempt=0;$taskboardAttempt -lt 60;$taskboardAttempt++) {
  try {
    $taskboardListener=Get-NetTCPConnection -LocalPort $DebugPort -State Listen -ErrorAction Stop
    $taskboardProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$($taskboardListener.OwningProcess)"
    if($taskboardProcess.Name -ne 'ChatGPT.exe' -or -not $taskboardProcess.CommandLine.Contains($taskboardProfile)){throw 'Debug listener profile mismatch.'}
    if($taskboardListener.LocalAddress -ne '127.0.0.1'){throw 'Debug listener must be loopback only.'}
    Invoke-RestMethod "http://127.0.0.1:$DebugPort/json/version" -TimeoutSec 2 | Out-Null
    $taskboardAppPid=$taskboardListener.OwningProcess; $taskboardConnected=$true; break
  } catch {Start-Sleep -Milliseconds 500}
}
if(-not $taskboardConnected){throw 'The dedicated Codex App did not expose its renderer. Your existing App has not been closed.'}
$taskboardConfig=@{cdpPort=$DebugPort;profile=$taskboardProfile;appPid=$taskboardAppPid;boardUrl="http://127.0.0.1:$Port";startedAt=[DateTimeOffset]::Now.ToString('o')}
$taskboardConfig | ConvertTo-Json | Set-Content -LiteralPath $taskboardRuntimePath -Encoding UTF8
$taskboardHelper=@(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine.Contains((Join-Path $taskboardRoot 'app-injector.mjs')) -and $_.CommandLine.Contains($taskboardRuntimePath) })
if(-not $taskboardHelper.Count) {
  if(Test-Path -LiteralPath $taskboardStopPath){Remove-Item -LiteralPath $taskboardStopPath}
  $taskboardHelperArgs=@(('"'+(Join-Path $taskboardRoot 'app-injector.mjs')+'"'),('"'+$taskboardRuntimePath+'"'))
  Start-Process -FilePath $taskboardNode -ArgumentList $taskboardHelperArgs -WorkingDirectory $taskboardRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskboardState 'app.stdout.log') -RedirectStandardError (Join-Path $taskboardState 'app.stderr.log') | Out-Null
}
[Guid]::NewGuid().ToString() | Set-Content -LiteralPath $taskboardShowPath -Encoding ASCII
for($taskboardAttempt=0;$taskboardAttempt -lt 30;$taskboardAttempt++) {
  Start-Sleep -Milliseconds 500
  if(Test-Path -LiteralPath $taskboardStatusPath) {
    $taskboardStatus=Get-Content -LiteralPath $taskboardStatusPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if($taskboardStatus.phase -eq 'ready'){Write-Output 'Codex App taskboard ready.';return}
  }
}
Write-Output 'Dedicated Codex App launched. Integration is waiting for the native navigation (sign in if requested).'
} finally {
  if($taskboardOwnsLock){$taskboardMutex.ReleaseMutex()}
  $taskboardMutex.Dispose()
}
