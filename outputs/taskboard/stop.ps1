param([int]$Port = 47824)
$ErrorActionPreference = 'Stop'
$taskboardUrl = "http://127.0.0.1:$Port"
$taskboardHtml = (Invoke-WebRequest -Uri $taskboardUrl -TimeoutSec 3).Content
$taskboardMatch = [regex]::Match($taskboardHtml, "const TOKEN='([^']+)'")
if (-not $taskboardMatch.Success -or $taskboardHtml -notlike '*caspar-taskboard*') { throw 'The port does not belong to this taskboard.' }
$taskboardHeaders = @{'X-Board-Token'=$taskboardMatch.Groups[1].Value}
Invoke-RestMethod -Uri "$taskboardUrl/api/shutdown" -Method Post -Headers $taskboardHeaders -ContentType 'application/json' -Body '{}' | Out-Null
Write-Output 'Taskboard stopped. Cards and history are preserved.'
