<#
.SYNOPSIS
  檢查 AI 協作結構：版控、必要檔案、入口引用、文件長度、佔位符、設定格式、UTF-8 與技能鏡像。
.DESCRIPTION
  一般模式：TODO(project) 為警告。-Strict：TODO(project) 視為失敗。
  只讀取檔案，不修改專案（技能鏡像以 sync-skills.ps1 -Check 檢查）。
#>
[CmdletBinding()]
param(
  [switch]$Strict,
  [string]$Root
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
if (-not $Root) { $Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot) }
$Root = (Resolve-Path -LiteralPath $Root).Path

$script:errors = New-Object System.Collections.Generic.List[string]
$script:warnings = New-Object System.Collections.Generic.List[string]
function Fail([string]$msg) { $script:errors.Add($msg) | Out-Null; Write-Host "  [失敗] $msg" -ForegroundColor Red }
function Warn([string]$msg) { $script:warnings.Add($msg) | Out-Null; Write-Host "  [警告] $msg" -ForegroundColor DarkYellow }
function Ok([string]$msg) { Write-Host "  [通過] $msg" -ForegroundColor Green }
function P([string]$rel) { return (Join-Path $Root $rel) }

$strictUtf8 = New-Object System.Text.UTF8Encoding($false, $true)
function Read-Utf8([string]$rel) {
  $bytes = [System.IO.File]::ReadAllBytes((P $rel))
  $offset = 0
  if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) { $offset = 3 }
  try { return $strictUtf8.GetString($bytes, $offset, $bytes.Length - $offset) }
  catch { Fail "$rel 不是有效 UTF-8"; return '' }
}

Write-Host "AI 結構檢查：$Root$(if ($Strict) { '（Strict）' })"

# 1. 版控
Write-Host '[1] 版控'
$taskboardGitResult = & git -C $Root rev-parse --is-inside-work-tree 2>&1
if ($LASTEXITCODE -eq 0 -and $taskboardGitResult -eq 'true') { Ok 'Git repository／worktree 版控可用' }
else { Fail "Git 狀態檢查失敗（不可直接視為缺少 repository）：$taskboardGitResult" }

# 2. 必要檔案
Write-Host '[2] 必要檔案'
$required = @(
  'AGENTS.md', 'CLAUDE.md', 'AI_CONTEXT.md', 'MODEL_ROUTING.md',
  '.agents/harness/engineering-workflow.md', '.agents/harness/project-rules.md',
  '.agents/harness/skill-sync.json', '.agents/harness/TEMPLATE_VERSION',
  '.agents/skills/ai-handoff/SKILL.md', '.ai/handoff.md',
  '.claude/settings.json',
  '.claude/agents/fast-worker.md', '.claude/agents/developer.md', '.claude/agents/developer-deep.md',
  '.claude/agents/architect.md', '.claude/agents/architect-deep.md',
  '.claude/hooks/model_router.mjs', '.claude/skills/ai-handoff/SKILL.md',
  'docs/architecture.md', 'docs/decisions.md', 'docs/current-status.md', 'docs/changelog-ai.md',
  'scripts/ai/sync-skills.ps1', 'scripts/ai/check-ai-structure.ps1',
  'scripts/ai/check-model-routing.mjs', 'scripts/ai/bench-model-routing.mjs'
)
$missing = @($required | Where-Object { -not (Test-Path -LiteralPath (P $_)) })
foreach ($m in $missing) { Fail "缺少 $m" }
if ($missing.Count -eq 0) { Ok "$($required.Count) 個必要檔案齊全" }

# 3. 入口引用
Write-Host '[3] 入口引用'
$errorsBefore = $script:errors.Count
if (Test-Path -LiteralPath (P 'CLAUDE.md')) {
  $claude = Read-Utf8 'CLAUDE.md'
  foreach ($imp in @('@AGENTS.md', '@AI_CONTEXT.md', '@.agents/harness/engineering-workflow.md', '@.agents/harness/project-rules.md', '@MODEL_ROUTING.md')) {
    if ($claude -notmatch ('(?m)^' + [regex]::Escape($imp) + '\s*$')) { Fail "CLAUDE.md 未匯入 $imp（需獨立一行）" }
  }
}
if (Test-Path -LiteralPath (P 'AGENTS.md')) {
  $agents = Read-Utf8 'AGENTS.md'
  foreach ($ref in @('AI_CONTEXT.md', 'engineering-workflow.md', 'project-rules.md', '.ai/handoff.md', 'docs/current-status.md', 'ai-handoff')) {
    if (-not $agents.Contains($ref)) { Fail "AGENTS.md 未引用 $ref" }
  }
  if ($agents -match '(?m)^@') { Warn 'AGENTS.md 含 @ 匯入行；Codex 不解析，請改由 CLAUDE.md 匯入' }
}
if (Test-Path -LiteralPath (P 'AI_CONTEXT.md')) {
  $ctx = Read-Utf8 'AI_CONTEXT.md'
  foreach ($section in @('## 用途', '## 技術棧', '## 重要目錄', '## 建置與測試', '## 限制與不變條件', '## 詞彙', '## Context Routing')) {
    if (-not $ctx.Contains($section)) { Fail "AI_CONTEXT.md 缺少段落「$section」" }
  }
}
if ($script:errors.Count -eq $errorsBefore) { Ok '入口引用完整' }

# 4. 文件長度
Write-Host '[4] 文件長度'
$limits = @{ '.ai/handoff.md' = 60; 'AGENTS.md' = 80; 'CLAUDE.md' = 40 }
foreach ($rel in $limits.Keys) {
  if (-not (Test-Path -LiteralPath (P $rel))) { continue }
  $lines = @((Read-Utf8 $rel) -split "`n").Count
  if ((Read-Utf8 $rel).EndsWith("`n")) { $lines -= 1 }
  if ($lines -gt $limits[$rel]) { Fail "$rel 有 $lines 行，超過上限 $($limits[$rel])" } else { Ok "$rel $lines 行（上限 $($limits[$rel])）" }
}
if (Test-Path -LiteralPath (P 'AGENTS.md')) {
  $size = (Get-Item -LiteralPath (P 'AGENTS.md')).Length
  if ($size -gt 32768) { Fail "AGENTS.md $size bytes，超過 Codex 32 KiB 上限" }
}

# 5. 佔位符與 UTF-8
Write-Host '[5] 佔位符與編碼'
$docFiles = New-Object System.Collections.Generic.List[string]
foreach ($rel in @('AGENTS.md', 'CLAUDE.md', 'AI_CONTEXT.md', 'MODEL_ROUTING.md', '.ai/handoff.md', 'docs/architecture.md', 'docs/decisions.md', 'docs/current-status.md', 'docs/changelog-ai.md')) {
  if (Test-Path -LiteralPath (P $rel)) { $docFiles.Add($rel) | Out-Null }
}
foreach ($dir in @('.agents/harness', '.agents/skills', '.claude/agents', '.claude/skills')) {
  if (-not (Test-Path -LiteralPath (P $dir))) { continue }
  $base = (Resolve-Path -LiteralPath (P $dir)).Path
  Get-ChildItem -LiteralPath $base -Recurse -File -Filter '*.md' | ForEach-Object {
    $docFiles.Add(($dir + '/' + $_.FullName.Substring($base.Length + 1).Replace('\', '/'))) | Out-Null
  }
}
$todoCount = 0
foreach ($rel in $docFiles) {
  $text = Read-Utf8 $rel
  if ($text.Contains([char]0xFFFD)) { Fail "$rel 含替換字元 U+FFFD（可能亂碼）" }
  if ($text -match '〈填入|<填入|\{\{[^}]+\}\}|PLACEHOLDER|待填入') { Fail "$rel 含未填寫的範本佔位符" }
  $todos = [regex]::Matches($text, 'TODO\(project\)`?\s*[:：]')
  if ($todos.Count -gt 0) {
    $todoCount += $todos.Count
    $msg = "$rel 有 $($todos.Count) 個 TODO(project)"
    if ($Strict) { Fail $msg } else { Warn $msg }
  }
}
Ok "掃描 $($docFiles.Count) 份文件；TODO(project) 共 $todoCount 個"

# 6. 設定格式
Write-Host '[6] 設定格式'
function Read-Json([string]$rel) {
  try { return ((Read-Utf8 $rel) | ConvertFrom-Json) } catch { Fail "$rel 不是有效 JSON：$($_.Exception.Message)"; return $null }
}
if (Test-Path -LiteralPath (P '.claude/settings.json')) {
  $settings = Read-Json '.claude/settings.json'
  if ($settings) {
    $hookText = [string]($settings.hooks.UserPromptSubmit | ConvertTo-Json -Depth 10)
    if (-not ($hookText -match 'model_router\.mjs')) { Fail '.claude/settings.json 未接上 model_router.mjs（UserPromptSubmit）' }
    if ($settings.permissions.defaultMode -eq 'bypassPermissions') { Fail '.claude/settings.json 設定了 bypassPermissions' }
    $deny = @($settings.permissions.deny)
    foreach ($rule in @('Bash(git add .)', 'Bash(git add -A)')) { if ($deny -notcontains $rule) { Fail ".claude/settings.json permissions.deny 缺少 $rule" } }
  }
}
if (Test-Path -LiteralPath (P '.agents/harness/skill-sync.json')) {
  $sync = Read-Json '.agents/harness/skill-sync.json'
  if ($sync) { foreach ($k in @('source', 'targets', 'shared', 'claudeOnly', 'codexOnly', 'ignore')) { if ($null -eq $sync.PSObject.Properties[$k]) { Fail "skill-sync.json 缺少欄位 $k" } } }
}
if (Test-Path -LiteralPath (P '.agents/harness/TEMPLATE_VERSION')) {
  $ver = (Read-Utf8 '.agents/harness/TEMPLATE_VERSION').Trim()
  if ($ver -notmatch '^harness-\d+\.\d+\.\d+$') { Fail "TEMPLATE_VERSION 格式不符：'$ver'" } else { Ok "TEMPLATE_VERSION $ver" }
}
foreach ($agent in @('fast-worker', 'developer', 'developer-deep', 'architect', 'architect-deep')) {
  $rel = ".claude/agents/$agent.md"
  if (-not (Test-Path -LiteralPath (P $rel))) { continue }
  $text = Read-Utf8 $rel
  if ($text -notmatch "(?s)^---\r?\n.*?name:\s*$agent\r?\n.*?\r?\n---") { Fail "$rel frontmatter 缺少或 name 不符" }
}
if (Test-Path -LiteralPath (P '.gitignore')) {
  $gi = Read-Utf8 '.gitignore'
  foreach ($pattern in @('.claude/settings.local.json', '.claude/worktrees/', '.ai/bench/')) {
    if (-not $gi.Contains($pattern)) { Fail ".gitignore 缺少 $pattern" }
  }
} else { Fail '缺少 .gitignore' }

# 7. 技能鏡像
Write-Host '[7] 技能鏡像'
$syncScript = P 'scripts/ai/sync-skills.ps1'
if (Test-Path -LiteralPath $syncScript) {
  $taskboardShell = if (Get-Command powershell -ErrorAction SilentlyContinue) { 'powershell' } else { 'pwsh' }
  $out = & $taskboardShell -NoProfile -ExecutionPolicy Bypass -File $syncScript -Check -Root $Root 2>&1
  if ($LASTEXITCODE -ne 0) { Fail 'sync-skills.ps1 -Check 失敗：'; $out | ForEach-Object { Write-Host "      $_" } }
  else { Ok 'sync-skills.ps1 -Check 一致' }
}

Write-Host ''
Write-Host "結果：$($script:errors.Count) 個失敗，$($script:warnings.Count) 個警告"
if ($script:errors.Count -gt 0) { exit 1 }
exit 0
