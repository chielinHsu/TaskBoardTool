<#
	Validate the shared Codex / Claude Code structure of this repository (template 3.0.0, TaskBoardTool edition).

	  check-ai-structure.ps1            FAIL on structural errors, WARN on unfilled TODO(project)
	  check-ai-structure.ps1 -Strict    unfilled TODO(project) also FAILs

	Exit code 0 = no FAIL, 1 = at least one FAIL.
	This checks structure only. It does not judge whether the content is good.

	What is checked:
	  - required files of template 3.0.0 and TEMPLATE_VERSION (major version 3)
	  - AGENTS.md: required reading, the four mandatory rules (keywords), size, links
	  - CLAUDE.md: required imports (and @MODEL_ROUTING.md when MODEL_ROUTING.md exists)
	  - plans (3.0.0): docs/plans/INDEX.md rows (unique IDs, link to <state>/<ID>-<slug>/plan.md, status matches the folder,
	    next free number), every plan folder is listed and has plan.md, status.md, changelog.md, frontmatter id = folder ID,
	    relative links inside the plans, docs/current-status.md and .ai/handoff.md resolve; leftovers of 2.x
	    ("## 需求進度表" in current-status.md FAIL, docs/changelog-ai.md and docs/plan/ WARN)
	  - docs/current-status.md is a project-level snapshot (WARN above 80 lines)
	  - docs/decisions.md is an index (no embedded ADR) and docs/adr/ exists, linked ADR files exist
	  - unreplaced {{PLACEHOLDER}}, unfilled TODO(project): (FAIL with -Strict)
	  - .claude/settings.json is valid JSON
	  - skill mirror (.agents/skills vs .claude/skills) through sync-skills.ps1 -Check
	  - model routing, when MODEL_ROUTING.md exists: five agents, hook, settings wiring, and
	    node scripts/ai/check-model-routing.mjs
	Project-specific additions (TaskBoardTool, see ADR-025 and ADR-027). This file is project-maintained: it is listed in
	.agents/harness/template-overrides.txt, so New-AiProject.ps1 -Refresh does not overwrite it; when the template's
	check-ai-structure.ps1 changes, merge the change by hand:
	  - the repository root is resolved with Split-Path, so the script also runs under pwsh on Linux (CI runs it there)
	  - bench-model-routing.mjs and the .claude/skills mirror are required files
	  - git work tree check
	  - .claude/settings.json: no bypassPermissions, deny rules for git add . / git add -A
	  - agent frontmatter names, .gitignore patterns, documents are valid UTF-8 without U+FFFD
	This file contains Chinese keywords: keep it saved as UTF-8 with BOM (Windows PowerShell 5.1).
#>

[CmdletBinding()]
param(
	[switch]$Strict,
	[string]$RepositoryRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($RepositoryRoot))
{
	# Split-Path instead of Join-Path '..\..': a backslash is a normal character on Linux (CI runs this under pwsh there).
	$RepositoryRoot = (Resolve-Path -LiteralPath (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))).Path
}

$fails = New-Object System.Collections.Generic.List[string]
$warns = New-Object System.Collections.Generic.List[string]

function Add-Fail { param([string]$Message) $script:fails.Add($Message) }
function Add-Warn { param([string]$Message) $script:warns.Add($Message) }

function Read-Text
{
	param([string]$RelativePath)

	return [IO.File]::ReadAllText((Join-Path $RepositoryRoot $RelativePath), [Text.Encoding]::UTF8)
}

function Test-RepoFile
{
	param([string]$RelativePath)

	return Test-Path -LiteralPath (Join-Path $RepositoryRoot $RelativePath) -PathType Leaf
}

function Test-RepoDirectory
{
	param([string]$RelativePath)

	return Test-Path -LiteralPath (Join-Path $RepositoryRoot $RelativePath) -PathType Container
}

# ---- 1. required files (template 3.0.0) --------------------------------------
$requiredFiles = @(
	'AGENTS.md',
	'CLAUDE.md',
	'AI_CONTEXT.md',
	'.agents/harness/engineering-workflow.md',
	'.agents/harness/project-rules.md',
	'.agents/harness/skill-sync.json',
	'.agents/harness/TEMPLATE_VERSION',
	'.agents/skills/ai-handoff/SKILL.md',
	'.ai/handoff.md',
	'docs/00-master-plan.md',
	'docs/architecture.md',
	'docs/decisions.md',
	'docs/current-status.md',
	'docs/plans/INDEX.md',
	'docs/plans/_template/plan.md',
	'docs/plans/_template/status.md',
	'docs/plans/_template/changelog.md',
	'docs/plans/_template/tasks/_task.md',
	'docs/adr/_template.md',
	'docs/steps/_template/spec.md',
	'docs/steps/_template/diagram.md',
	'docs/steps/_template/explainer.html',
	'docs/steps/_template/perf.md',
	'docs/steps/_template/storyboard.md',
	'tools/ste-lint.mjs',
	'scripts/ai/sync-skills.ps1',
	'scripts/ai/check-ai-structure.ps1',
	# project-specific (TaskBoardTool)
	'.claude/skills/ai-handoff/SKILL.md',
	'scripts/ai/bench-model-routing.mjs'
)
foreach ($file in $requiredFiles)
{
	if (-not (Test-RepoFile $file))
	{
		Add-Fail "missing required file: $file"
	}
}
if (-not (Test-RepoDirectory 'docs/adr'))
{
	Add-Fail 'missing required folder: docs/adr (one file per decision: docs/adr/NNN-slug.md)'
}

# ---- 2. TEMPLATE_VERSION ------------------------------------------------------
$templateVersion = ''
if (Test-RepoFile '.agents/harness/TEMPLATE_VERSION')
{
	$templateVersion = (Read-Text '.agents/harness/TEMPLATE_VERSION').Trim()
	if ($templateVersion -notmatch '^3\.\d+\.\d+$')
	{
		Add-Fail "TEMPLATE_VERSION is '$templateVersion'; this checker is for template 3.x (run New-AiProject.ps1 -Refresh from the 3.0.0 template, then migrate-ai-structure-3.mjs)"
	}
}

# ---- 3. AGENTS.md (Codex entry, shared by Claude through the import) --------
$readFirst = @(
	'AI_CONTEXT.md',
	'.agents/harness/engineering-workflow.md',
	'.agents/harness/project-rules.md',
	'.ai/handoff.md',
	'docs/current-status.md',
	'docs/plans/INDEX.md'
)

# The four mandatory rules: [rule description, keywords that must all appear in AGENTS.md].
$mandatoryRules = @(
	@('rule 1 (reply in Traditional Chinese zh-TW, summarize on completion)', @('繁體中文', 'zh-TW', '總結')),
	@('rule 2 (no fabricated verification, no hidden failures)', @('不虛構驗證', '不隱藏失敗')),
	@('rule 3 (no unrequested commit/push, explicit staging)', @('不擅自 commit', 'git add -A')),
	@('rule 4 (route each request to its own plan and expand it before implementing)', @('docs/plans/INDEX.md', 'plan.md', '計畫分開管理'))
)

if (Test-RepoFile 'AGENTS.md')
{
	$agentsText = Read-Text 'AGENTS.md'
	$agentsBytes = (Get-Item -LiteralPath (Join-Path $RepositoryRoot 'AGENTS.md')).Length

	foreach ($path in $readFirst)
	{
		if ($agentsText.IndexOf($path, [StringComparison]::Ordinal) -lt 0)
		{
			Add-Fail "AGENTS.md does not list required reading: $path"
		}
	}

	foreach ($rule in $mandatoryRules)
	{
		foreach ($keyword in $rule[1])
		{
			if ($agentsText.IndexOf($keyword, [StringComparison]::Ordinal) -lt 0)
			{
				Add-Fail "AGENTS.md is missing the mandatory $($rule[0]): keyword not found: $keyword"
			}
		}
	}

	# Codex stops adding AGENTS.md content once the combined size reaches 32 KiB.
	if ($agentsBytes -gt 32768)
	{
		Add-Fail "AGENTS.md is $agentsBytes bytes; Codex truncates project docs above 32768 bytes"
	}
	$agentsLines = ($agentsText -split "`n").Count
	if ($agentsLines -gt 80)
	{
		Add-Warn "AGENTS.md has $agentsLines lines; it is an entry file, move content into the shared docs"
	}

	foreach ($match in [regex]::Matches($agentsText, '\]\(([^)#\s]+)(#[^)]*)?\)'))
	{
		$target = $match.Groups[1].Value
		if (($target -notmatch '^[a-zA-Z][a-zA-Z0-9+.-]*:') -and (-not (Test-RepoFile $target)))
		{
			Add-Fail "AGENTS.md links to a file that does not exist: $target"
		}
	}
}

# ---- 4. CLAUDE.md (Claude entry) ---------------------------------------------
$requiredImports = @(
	'AGENTS.md',
	'AI_CONTEXT.md',
	'.agents/harness/engineering-workflow.md',
	'.agents/harness/project-rules.md'
)
$hasModelRouting = Test-RepoFile 'MODEL_ROUTING.md'
if ($hasModelRouting)
{
	$requiredImports += 'MODEL_ROUTING.md'
}

if (Test-RepoFile 'CLAUDE.md')
{
	$claudeText = Read-Text 'CLAUDE.md'
	$imports = @()
	foreach ($match in [regex]::Matches($claudeText, '(?m)^@(\S+)\s*$'))
	{
		$imports += $match.Groups[1].Value
	}

	foreach ($path in $requiredImports)
	{
		if ($imports -notcontains $path)
		{
			Add-Fail "CLAUDE.md does not import: @$path"
		}
	}
	foreach ($path in $imports)
	{
		if (-not (Test-RepoFile $path))
		{
			Add-Fail "CLAUDE.md imports a file that does not exist: @$path"
		}
	}

	$claudeLines = ($claudeText -split "`n").Count
	if ($claudeLines -gt 80)
	{
		Add-Warn "CLAUDE.md has $claudeLines lines; keep only Claude-specific rules here"
	}
}

# ---- 5. plans (template 3.0.0): docs/plans/INDEX.md and one folder per plan ----
# The requirements table of template 2.x moved into the plans; a leftover table means the migration is unfinished.
if (Test-RepoFile 'docs/current-status.md')
{
	$statusText = Read-Text 'docs/current-status.md'
	if ([regex]::IsMatch($statusText, '(?m)^##\s+需求進度表'))
	{
		Add-Fail 'docs/current-status.md still has the 2.x "## 需求進度表"; move each unfinished request into its own plan (docs/plans/) and the old file into docs/legacy/'
	}
}
if (Test-RepoFile 'docs/changelog-ai.md')
{
	Add-Warn 'docs/changelog-ai.md is the 2.x global changelog; move it to docs/legacy/ and write new entries into each plan''s changelog.md'
}
if (Test-RepoDirectory 'docs/plan')
{
	Add-Warn 'docs/plan/ is the 2.x plan folder; move it to docs/legacy/plan/ (finished plans) or into docs/plans/active/<ID>-<slug>/plan.md (unfinished ones)'
}

# Relative Markdown links: [text](target). URLs, anchors and template markers (<...>, {{...}}, Rnn, NNN) are skipped.
function Test-RelativeLinks
{
	param([string]$RelativePath)

	$text = Read-Text $RelativePath
	$folder = Split-Path -Parent (Join-Path $RepositoryRoot $RelativePath)
	foreach ($match in [regex]::Matches($text, '\]\(([^)#\s]+)(#[^)]*)?\)'))
	{
		$target = $match.Groups[1].Value
		if ($target -match '^[a-zA-Z][a-zA-Z0-9+.-]*:' -or $target -match '[<>{}]|Rnn|NNN|YYYY')
		{
			continue
		}
		if (-not (Test-Path -LiteralPath (Join-Path $folder ([Uri]::UnescapeDataString($target)))))
		{
			Add-Fail "$RelativePath links to a path that does not exist: $target"
		}
	}
}

$planStates = [ordered]@{ 'active' = @('⬜', '⏳', '⚠️', '⚠'); 'completed' = @('✅'); 'cancelled' = @('⛔') }
$indexIds = @{}
if (Test-RepoFile 'docs/plans/INDEX.md')
{
	$indexText = Read-Text 'docs/plans/INDEX.md'
	$maxNumber = 0
	foreach ($line in ($indexText -split "`r?`n"))
	{
		$cells = @($line.Trim().Trim('|').Split('|') | ForEach-Object { $_.Trim() })
		if (($cells.Count -lt 5) -or ($cells[0] -notmatch '^[A-Z]+\d+$'))
		{
			continue
		}
		$id = $cells[0]
		if ($indexIds.ContainsKey($id))
		{
			Add-Fail "docs/plans/INDEX.md lists $id twice (plan IDs are unique)"
			continue
		}
		$link = [regex]::Match($line, '\]\(((active|completed|cancelled)/([^/)]+)/plan\.md)\)')
		if (-not $link.Success)
		{
			Add-Fail "docs/plans/INDEX.md row $id has no link to <active|completed|cancelled>/<ID>-<slug>/plan.md"
			continue
		}
		$state = $link.Groups[2].Value
		$folderName = $link.Groups[3].Value
		$indexIds[$id] = "$state/$folderName"
		if (-not $folderName.StartsWith("$id-"))
		{
			Add-Fail "docs/plans/INDEX.md row $id points to the folder '$folderName'; plan folders are named <ID>-<slug>"
		}
		$statusCell = $cells[3]
		$allowed = $planStates[$state]
		if (-not ($allowed | Where-Object { $statusCell.Contains($_) }))
		{
			Add-Fail "docs/plans/INDEX.md row $id has status '$statusCell' but lives in $state/ (✅ → completed/, ⛔ → cancelled/, others → active/)"
		}
		if ($id -match '^R(\d+)$') { $maxNumber = [Math]::Max($maxNumber, [int]$Matches[1]) }
	}
	$next = [regex]::Match($indexText, '下一個可用編號[^R]*R(\d+)')
	if (-not $next.Success)
	{
		Add-Warn 'docs/plans/INDEX.md does not state the next free plan number (下一個可用編號：**Rnn**)'
	}
	elseif ([int]$next.Groups[1].Value -le $maxNumber)
	{
		Add-Fail "docs/plans/INDEX.md: the next free number R$($next.Groups[1].Value) is already used (highest is R$maxNumber)"
	}
	Test-RelativeLinks 'docs/plans/INDEX.md'
}

foreach ($state in $planStates.Keys)
{
	$stateFolder = "docs/plans/$state"
	if (-not (Test-RepoDirectory $stateFolder))
	{
		Add-Fail "missing required folder: $stateFolder"
		continue
	}
	foreach ($plan in (Get-ChildItem -LiteralPath (Join-Path $RepositoryRoot $stateFolder) -Directory))
	{
		$planPath = "$stateFolder/$($plan.Name)"
		$planId = ($plan.Name -split '-', 2)[0]
		if (-not $indexIds.ContainsKey($planId))
		{
			Add-Fail "$planPath is not listed in docs/plans/INDEX.md"
		}
		elseif ($indexIds[$planId] -ne "$state/$($plan.Name)")
		{
			Add-Fail "${planPath}: docs/plans/INDEX.md points $planId to $($indexIds[$planId])"
		}
		foreach ($name in @('plan.md', 'status.md', 'changelog.md'))
		{
			if (-not (Test-RepoFile "$planPath/$name"))
			{
				Add-Fail "$planPath is missing $name"
			}
		}
		if (Test-RepoFile "$planPath/plan.md")
		{
			$frontId = [regex]::Match((Read-Text "$planPath/plan.md"), '(?m)\A---\r?\n(?:.*\r?\n)*?id:\s*(\S+)')
			if (-not $frontId.Success)
			{
				Add-Warn "$planPath/plan.md has no frontmatter id"
			}
			elseif ($frontId.Groups[1].Value -ne $planId)
			{
				Add-Fail "$planPath/plan.md frontmatter id is '$($frontId.Groups[1].Value)', the folder says $planId"
			}
		}
		foreach ($item in (Get-ChildItem -LiteralPath $plan.FullName -Recurse -File -Filter '*.md'))
		{
			Test-RelativeLinks ($planPath + '/' + $item.FullName.Substring($plan.FullName.Length + 1).Replace('\', '/'))
		}
	}
}
foreach ($file in @('docs/current-status.md', '.ai/handoff.md'))
{
	if (Test-RepoFile $file) { Test-RelativeLinks $file }
}

# ---- 6. decisions.md is an index, docs/adr/ holds the decisions ---------------
if (Test-RepoFile 'docs/decisions.md')
{
	$decisionsText = Read-Text 'docs/decisions.md'
	if ([regex]::IsMatch($decisionsText, '(?m)^##\s+(ADR|D)-?\d+'))
	{
		Add-Fail 'docs/decisions.md still embeds decisions (## ADR-nnn / ## D-nnnn headings); move them to docs/adr/NNN-slug.md and keep only an index here'
	}
	$adrLinks = [regex]::Matches($decisionsText, '\]\((adr/[^)#\s]+)(#[^)]*)?\)')
	if ($adrLinks.Count -eq 0)
	{
		Add-Fail 'docs/decisions.md has no links to docs/adr/ files; it must be an index (one row per ADR)'
	}
	foreach ($match in $adrLinks)
	{
		$target = 'docs/' + $match.Groups[1].Value
		if (-not (Test-RepoFile $target))
		{
			Add-Fail "docs/decisions.md links to an ADR file that does not exist: $target"
		}
	}
}

# ---- 7. state files stay small ----------------------------------------------
$lineLimits = @{
	'.ai/handoff.md'          = 60
	'docs/current-status.md'  = 80
}
foreach ($file in $lineLimits.Keys)
{
	if (Test-RepoFile $file)
	{
		$count = ((Read-Text $file) -split "`n").Count
		if ($count -gt $lineLimits[$file])
		{
			Add-Warn "$file has $count lines (limit $($lineLimits[$file])); trim it (.ai/handoff.md is overwritten at each handoff; docs/current-status.md is a project-level snapshot: move plan details into the plan's status.md and history into its changelog.md)"
		}
	}
}

# ---- 8. unreplaced template placeholders -------------------------------------
$placeholderScan = @('AGENTS.md', 'CLAUDE.md', 'AI_CONTEXT.md', 'MODEL_ROUTING.md', '.ai/handoff.md') +
	@(Get-ChildItem -LiteralPath (Join-Path $RepositoryRoot 'docs') -Filter '*.md' -File -ErrorAction SilentlyContinue |
		ForEach-Object { 'docs/' + $_.Name })
foreach ($file in $placeholderScan)
{
	if ((Test-RepoFile $file) -and ([regex]::IsMatch((Read-Text $file), '\{\{[A-Z_]+\}\}')))
	{
		Add-Fail "$file still contains an unreplaced template placeholder"
	}
}

# ---- 9. unfilled TODO(project) -----------------------------------------------
$todoFiles = @('AI_CONTEXT.md', '.agents/harness/project-rules.md', 'MODEL_ROUTING.md', 'docs/00-master-plan.md', 'docs/architecture.md')
$todoTotal = 0
$todoDetail = @()
foreach ($file in $todoFiles)
{
	if (Test-RepoFile $file)
	{
		$count = [regex]::Matches((Read-Text $file), 'TODO\(project\):').Count
		if ($count -gt 0)
		{
			$todoTotal += $count
			$todoDetail += "$file ($count)"
		}
	}
}
if ($todoTotal -gt 0)
{
	$message = "unfilled TODO(project): $todoTotal in " + ($todoDetail -join ', ')
	if ($Strict) { Add-Fail $message } else { Add-Warn $message }
}

# ---- 10. Claude settings and gitignore ---------------------------------------
$settingsJson = $null
if (Test-RepoFile '.claude/settings.json')
{
	try
	{
		$settingsJson = Read-Text '.claude/settings.json' | ConvertFrom-Json
	}
	catch
	{
		Add-Fail ".claude/settings.json is not valid JSON: $($_.Exception.Message)"
	}
}
else
{
	Add-Warn '.claude/settings.json is missing; git add -A / add . will not be blocked for Claude Code'
}

if (Test-RepoFile '.gitignore')
{
	if ((Read-Text '.gitignore') -notmatch '(?m)^\.claude/settings\.local\.json\s*$')
	{
		Add-Warn '.gitignore does not ignore .claude/settings.local.json'
	}
}
else
{
	Add-Warn '.gitignore is missing'
}

# ---- 11. skill mirror ----------------------------------------------------------
$syncScript = Join-Path $PSScriptRoot 'sync-skills.ps1'
if (Test-Path -LiteralPath $syncScript -PathType Leaf)
{
	# The child prints its own per-skill FAIL lines to the console.
	# Older project copies name the root parameter -Root instead of -RepositoryRoot; pass whichever exists.
	$syncParameters = (Get-Command -Name $syncScript).Parameters
	$syncArguments = @{ Check = $true }
	if ($syncParameters.ContainsKey('RepositoryRoot'))
	{
		$syncArguments['RepositoryRoot'] = $RepositoryRoot
	}
	elseif ($syncParameters.ContainsKey('Root'))
	{
		$syncArguments['Root'] = $RepositoryRoot
	}
	$global:LASTEXITCODE = 0
	try
	{
		& $syncScript @syncArguments
	}
	catch
	{
		Write-Host "FAIL sync-skills.ps1 raised an error: $($_.Exception.Message)"
		$global:LASTEXITCODE = 1
	}
	if ($LASTEXITCODE -ne 0)
	{
		Add-Fail 'skills: .agents/skills and .claude/skills are out of sync (details above); run scripts/ai/sync-skills.ps1'
	}
}

# ---- 12. model routing (Claude only; checked when MODEL_ROUTING.md exists) ------
if (-not $hasModelRouting)
{
	Add-Warn 'MODEL_ROUTING.md is missing; model routing for Claude Code subagents is not set up (template 3.0.0 includes it)'
}
else
{
	$agentNames = @('fast-worker', 'developer', 'developer-deep', 'architect', 'architect-deep')
	foreach ($agent in $agentNames)
	{
		if (-not (Test-RepoFile ".claude/agents/$agent.md"))
		{
			Add-Fail "model routing: missing .claude/agents/$agent.md"
		}
	}
	if (-not (Test-RepoFile '.claude/hooks/model_router.mjs'))
	{
		Add-Fail 'model routing: missing .claude/hooks/model_router.mjs'
	}
	if ($null -ne $settingsJson)
	{
		$hookText = ($settingsJson | ConvertTo-Json -Depth 20)
		if ($hookText.IndexOf('model_router.mjs', [StringComparison]::Ordinal) -lt 0)
		{
			Add-Fail 'model routing: .claude/settings.json does not register .claude/hooks/model_router.mjs (UserPromptSubmit)'
		}
	}

	$routingCheck = Join-Path $RepositoryRoot 'scripts/ai/check-model-routing.mjs'
	if (-not (Test-Path -LiteralPath $routingCheck -PathType Leaf))
	{
		Add-Fail 'model routing: missing scripts/ai/check-model-routing.mjs'
	}
	else
	{
		$node = Get-Command node -ErrorAction SilentlyContinue
		if ($null -eq $node)
		{
			Add-Warn 'node was not found in PATH; scripts/ai/check-model-routing.mjs was not run'
		}
		else
		{
			$previousPreference = $ErrorActionPreference
			$previousEncoding = [Console]::OutputEncoding
			$ErrorActionPreference = 'Continue'
			try
			{
				[Console]::OutputEncoding = [Text.Encoding]::UTF8
				$routingOutput = & $node.Source $routingCheck 2>&1 | Out-String
				$routingExit = $LASTEXITCODE
			}
			finally
			{
				$ErrorActionPreference = $previousPreference
				[Console]::OutputEncoding = $previousEncoding
			}
			foreach ($line in ($routingOutput -split "`r?`n"))
			{
				if ($line -match '^(FAIL|WARN|RESULT)')
				{
					Write-Host "model-routing: $line"
				}
			}
			if ($routingExit -ne 0)
			{
				Add-Fail "model routing: node scripts/ai/check-model-routing.mjs failed (exit code $routingExit; run it directly for details)"
			}
		}
	}
}

# ---- 13. project-specific checks (TaskBoardTool; not part of the template) -------
$gitOutput = & git -C $RepositoryRoot rev-parse --is-inside-work-tree 2>&1
if (($LASTEXITCODE -ne 0) -or ("$gitOutput".Trim() -ne 'true'))
{
	Add-Fail "git work tree check failed (do not read this as 'no repository'): $gitOutput"
}

if ($null -ne $settingsJson)
{
	$permissions = $settingsJson.PSObject.Properties['permissions']
	$defaultMode = ''
	$denyRules = @()
	if ($null -ne $permissions)
	{
		if ($null -ne $permissions.Value.PSObject.Properties['defaultMode']) { $defaultMode = [string]$permissions.Value.defaultMode }
		if ($null -ne $permissions.Value.PSObject.Properties['deny']) { $denyRules = @($permissions.Value.deny) }
	}
	if ($defaultMode -eq 'bypassPermissions')
	{
		Add-Fail '.claude/settings.json sets bypassPermissions'
	}
	foreach ($rule in @('Bash(git add .)', 'Bash(git add -A)'))
	{
		if ($denyRules -notcontains $rule)
		{
			Add-Fail ".claude/settings.json permissions.deny is missing $rule"
		}
	}
}

foreach ($agent in @('fast-worker', 'developer', 'developer-deep', 'architect', 'architect-deep'))
{
	$agentFile = ".claude/agents/$agent.md"
	if ((Test-RepoFile $agentFile) -and ((Read-Text $agentFile) -notmatch "(?s)^---\r?\n.*?name:\s*$agent\r?\n.*?\r?\n---"))
	{
		Add-Fail "$agentFile frontmatter is missing or its name does not match"
	}
}

if (Test-RepoFile '.gitignore')
{
	$gitignoreText = Read-Text '.gitignore'
	foreach ($pattern in @('.claude/worktrees/', '.ai/bench/', 'CLAUDE.local.md'))
	{
		if ($gitignoreText.IndexOf($pattern, [StringComparison]::Ordinal) -lt 0)
		{
			Add-Fail ".gitignore is missing $pattern"
		}
	}
}

$strictUtf8 = New-Object System.Text.UTF8Encoding($false, $true)
$trimChars = [char[]]@([char]92, [char]47)
$encodingScan = @('AGENTS.md', 'CLAUDE.md', 'CODEX.md', 'AI_CONTEXT.md', 'MODEL_ROUTING.md', '.ai/handoff.md') +
	@(Get-ChildItem -LiteralPath (Join-Path $RepositoryRoot 'docs') -Filter '*.md' -File -Recurse -ErrorAction SilentlyContinue |
		ForEach-Object { $_.FullName.Substring($RepositoryRoot.Length).TrimStart($trimChars).Replace([string][char]92, '/') })
foreach ($file in $encodingScan)
{
	if (-not (Test-RepoFile $file)) { continue }
	try
	{
		$decoded = $strictUtf8.GetString([IO.File]::ReadAllBytes((Join-Path $RepositoryRoot $file)))
		if ($decoded.Contains([string][char]0xFFFD))
		{
			Add-Fail "$file contains U+FFFD (possible mojibake)"
		}
	}
	catch
	{
		Add-Fail "$file is not valid UTF-8"
	}
}

# ---- report -------------------------------------------------------------------
if ($templateVersion -ne '')
{
	Write-Host "Template version: $templateVersion"
}
foreach ($warn in $warns) { Write-Host "WARN $warn" }
foreach ($fail in $fails) { Write-Host "FAIL $fail" }

if ($fails.Count -gt 0)
{
	Write-Host "RESULT: FAILED ($($fails.Count) failure(s), $($warns.Count) warning(s))"
	exit 1
}

Write-Host "RESULT: OK ($($warns.Count) warning(s))"
exit 0
