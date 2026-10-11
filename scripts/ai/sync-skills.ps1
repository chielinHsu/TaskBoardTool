<#
.SYNOPSIS
  從 .agents/skills（唯一來源）同步共用 skill 到平台目錄（.claude/skills）。
.DESCRIPTION
  依 .agents/harness/skill-sync.json：
    shared     來源與鏡像都有，鏡像內容必須與來源一致。
    claudeOnly 只存在 .claude/skills 的平台專屬 skill，同步不覆蓋、不刪除。
    codexOnly  只存在 .agents/skills，不鏡像到 Claude。
    ignore     比對與複製時略過的檔名樣式。
  -Check 只檢查、不寫入；有差異時 exit 1。重複執行不會產生額外變更。
  未登記的 skill 與孤立鏡像只回報，不自動刪除。
#>
[CmdletBinding()]
param(
  [switch]$Check,
  [string]$Root
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
if (-not $Root) { $Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot) }
$Root = (Resolve-Path -LiteralPath $Root).Path
$configPath = Join-Path $Root '.agents/harness/skill-sync.json'

$script:problems = New-Object System.Collections.Generic.List[string]
$script:changes = New-Object System.Collections.Generic.List[string]
function Add-Problem([string]$msg) { $script:problems.Add($msg) | Out-Null; Write-Host "  [錯誤] $msg" -ForegroundColor Red }
function Add-Change([string]$msg) { $script:changes.Add($msg) | Out-Null; Write-Host "  [變更] $msg" -ForegroundColor Yellow }

if (-not (Test-Path -LiteralPath $configPath)) {
  Write-Host "找不到 $configPath" -ForegroundColor Red
  exit 1
}
try {
  $config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
} catch {
  Write-Host "skill-sync.json 不是有效 JSON：$($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

function As-Array($value) { if ($null -eq $value) { return @() } return @($value) }
$shared = As-Array $config.shared
$claudeOnly = As-Array $config.claudeOnly
$codexOnly = As-Array $config.codexOnly
$ignore = As-Array $config.ignore
$sourceDir = Join-Path $Root $config.source

function Test-Ignored([string]$name) {
  foreach ($pattern in $ignore) { if ($name -like $pattern) { return $true } }
  return $false
}

function Get-RelativeFiles([string]$dir) {
  $result = @{}
  if (-not (Test-Path -LiteralPath $dir)) { return $result }
  $base = (Resolve-Path -LiteralPath $dir).Path.TrimEnd('\', '/')
  Get-ChildItem -LiteralPath $dir -Recurse -File -Force | Where-Object { -not (Test-Ignored $_.Name) } | ForEach-Object {
    $rel = $_.FullName.Substring($base.Length + 1).Replace('\', '/')
    $result[$rel] = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
  }
  return $result
}

function Get-SkillNames([string]$dir) {
  if (-not (Test-Path -LiteralPath $dir)) { return @() }
  return @(Get-ChildItem -LiteralPath $dir -Directory -Force | Where-Object { -not (Test-Ignored $_.Name) } | ForEach-Object { $_.Name })
}

$mode = if ($Check) { '檢查' } else { '同步' }
Write-Host "技能$mode：$Root"

# 設定一致性
$overlap = @($shared | Where-Object { $claudeOnly -contains $_ -or $codexOnly -contains $_ }) + @($claudeOnly | Where-Object { $codexOnly -contains $_ })
foreach ($name in $overlap) { Add-Problem "skill '$name' 同時登記在多個分類" }

if (-not (Test-Path -LiteralPath $sourceDir)) { Add-Problem "來源目錄不存在：$($config.source)" }
$sourceSkills = Get-SkillNames $sourceDir

foreach ($name in $sourceSkills) {
  if (-not (Test-Path -LiteralPath (Join-Path $sourceDir "$name/SKILL.md"))) { Add-Problem "來源 skill '$name' 缺少 SKILL.md" }
  if (($shared -notcontains $name) -and ($codexOnly -notcontains $name)) {
    if ($claudeOnly -contains $name) { Add-Problem "claudeOnly skill '$name' 不應放在來源目錄 $($config.source)" }
    else { Add-Problem "來源 skill '$name' 未登記於 skill-sync.json（shared 或 codexOnly）" }
  }
}
foreach ($name in ($shared + $codexOnly)) {
  if ($sourceSkills -notcontains $name) { Add-Problem "已登記的 skill '$name' 不存在於來源目錄" }
}

foreach ($target in (As-Array $config.targets)) {
  $targetDir = Join-Path $Root $target.path
  Write-Host "目標 [$($target.platform)] $($target.path)"
  if (-not (Test-Path -LiteralPath $targetDir)) {
    if ($Check) { Add-Problem "目標目錄不存在：$($target.path)" }
    else { New-Item -ItemType Directory -Path $targetDir -Force | Out-Null; Add-Change "建立目錄 $($target.path)" }
  }
  $targetSkills = Get-SkillNames $targetDir

  foreach ($name in $targetSkills) {
    if ($shared -contains $name) { continue }
    if ($claudeOnly -contains $name -and $target.platform -eq 'claude') { Write-Host "  [保護] 平台專屬 skill '$name' 不同步、不刪除"; continue }
    Add-Problem "孤立或未登記的鏡像 '$($target.path)/$name'：請登記為 claudeOnly，或確認後手動刪除"
  }
  if ($target.platform -eq 'claude') {
    foreach ($name in $claudeOnly) {
      if ($targetSkills -notcontains $name) { Write-Host "  [警告] claudeOnly skill '$name' 不存在於 $($target.path)" -ForegroundColor DarkYellow }
    }
  }

  foreach ($name in $shared) {
    $src = Join-Path $sourceDir $name
    if (-not (Test-Path -LiteralPath $src)) { continue }
    $dst = Join-Path $targetDir $name
    $srcFiles = Get-RelativeFiles $src
    $dstFiles = Get-RelativeFiles $dst
    foreach ($rel in $srcFiles.Keys) {
      $differs = (-not $dstFiles.ContainsKey($rel)) -or ($dstFiles[$rel] -ne $srcFiles[$rel])
      if (-not $differs) { continue }
      if ($Check) { Add-Problem "鏡像不一致：$($target.path)/$name/$rel" }
      else {
        $destFile = Join-Path $dst $rel
        New-Item -ItemType Directory -Path (Split-Path -Parent $destFile) -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $src $rel) -Destination $destFile -Force
        Add-Change "更新 $($target.path)/$name/$rel"
      }
    }
    foreach ($rel in $dstFiles.Keys) {
      if ($srcFiles.ContainsKey($rel)) { continue }
      if ($Check) { Add-Problem "鏡像多出來源沒有的檔案：$($target.path)/$name/$rel" }
      else {
        Remove-Item -LiteralPath (Join-Path $dst $rel) -Force
        Add-Change "移除 $($target.path)/$name/$rel（來源已無此檔）"
      }
    }
  }
}

Write-Host ''
if ($script:problems.Count -gt 0) {
  Write-Host "結果：失敗（$($script:problems.Count) 個問題）" -ForegroundColor Red
  exit 1
}
if ($script:changes.Count -gt 0) { Write-Host "結果：完成同步（$($script:changes.Count) 項變更）" -ForegroundColor Green }
else { Write-Host '結果：一致，無需變更' -ForegroundColor Green }
exit 0
