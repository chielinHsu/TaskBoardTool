param([int]$Port = 47824, [switch]$NoBrowser, [string]$DataDirectory)
$ErrorActionPreference = 'Stop'
$taskboardRoot = $PSScriptRoot
$taskboardServer = Join-Path $taskboardRoot 'server.py'
$taskboardRuntime = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
if (-not (Test-Path -LiteralPath $taskboardRuntime)) {
    $taskboardPythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if (-not $taskboardPythonCommand) { throw 'Python runtime not found.' }
    $taskboardRuntime = $taskboardPythonCommand.Source
}
$taskboardCodexCommand = Get-Command codex.exe -ErrorAction SilentlyContinue
$taskboardCodex = if($taskboardCodexCommand){$taskboardCodexCommand.Source}else{$null}
if(-not $taskboardCodex) {
    $taskboardBin=Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin'
    if(Test-Path -LiteralPath $taskboardBin){
        $taskboardCached=@(Get-ChildItem -LiteralPath $taskboardBin -Directory | ForEach-Object {Get-Item -LiteralPath (Join-Path $_.FullName 'codex.exe') -ErrorAction SilentlyContinue} | Sort-Object LastWriteTime -Descending)
        if($taskboardCached.Count){$taskboardCodex=$taskboardCached[0].FullName}
    }
}
if (-not $taskboardCodex) { Write-Warning 'Codex executable not found; the board starts without Codex dispatch. Open Codex once to enable it.' }
# Claude Code CLI is optional too; the npm shim wraps bin/claude.exe, which the server resolves itself.
$taskboardClaudeCommand = Get-Command claude -ErrorAction SilentlyContinue
$taskboardClaude = if ($taskboardClaudeCommand) { $taskboardClaudeCommand.Source } else { $null }
if (-not $taskboardClaude) { Write-Warning 'Claude Code CLI (claude) not found; Claude Code dispatch stays unavailable until it is installed.' }
$taskboardData = if ($DataDirectory) { [IO.Path]::GetFullPath($DataDirectory) } else { Join-Path $taskboardRoot '.data' }
New-Item -ItemType Directory -Path $taskboardData -Force | Out-Null
$taskboardStdout = Join-Path $taskboardData 'launcher.stdout.log'
$taskboardStderr = Join-Path $taskboardData 'launcher.stderr.log'
$taskboardUrl = "http://127.0.0.1:$Port"
$taskboardAlreadyRunning = $false
try {
    $taskboardResponse = Invoke-WebRequest -Uri $taskboardUrl -TimeoutSec 2 -UseBasicParsing
    $taskboardAlreadyRunning = $taskboardResponse.Content -like '*Caspar*' -and $taskboardResponse.Content -like '*X-Board-Token*'
    if (-not $taskboardAlreadyRunning) { throw 'The port is occupied by another service.' }
} catch {
    if ($_.Exception.Message -eq 'The port is occupied by another service.') { throw }
}
if (-not $taskboardAlreadyRunning) {
    $taskboardArgs = @(('"' + $taskboardServer + '"'), '--port', $Port.ToString(), '--data-dir', ('"' + $taskboardData + '"'))
    if ($taskboardCodex) { $taskboardArgs += @('--codex', ('"' + $taskboardCodex + '"')) }
    if ($taskboardClaude) { $taskboardArgs += @('--claude', ('"' + $taskboardClaude + '"')) }
    $taskboardProcess = Start-Process -FilePath $taskboardRuntime -ArgumentList $taskboardArgs -WorkingDirectory $taskboardRoot -WindowStyle Hidden -RedirectStandardOutput $taskboardStdout -RedirectStandardError $taskboardStderr -PassThru
    for ($taskboardAttempt = 0; $taskboardAttempt -lt 40; $taskboardAttempt++) {
        Start-Sleep -Milliseconds 250
        if ($taskboardProcess.HasExited) { throw 'Taskboard could not start. Check .data\launcher.stderr.log.' }
        try { Invoke-WebRequest -Uri $taskboardUrl -TimeoutSec 1 -UseBasicParsing | Out-Null; break } catch { }
    }
}
if (-not $NoBrowser) { Start-Process $taskboardUrl }
Write-Output $taskboardUrl
