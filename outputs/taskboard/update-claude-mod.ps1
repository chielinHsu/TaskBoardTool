param(
    [string]$InstalledModPath = '',
    [switch]$Check
)
$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'claude-mod/taskboard-pane'
$devMods = Join-Path $env:USERPROFILE '.claude/dev-mods'
if (-not $InstalledModPath) {
    $candidates = @(Get-ChildItem -LiteralPath $devMods -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        $candidate = Join-Path $_.FullName 'taskboard-pane'
        $manifestPath = Join-Path $candidate '.claude-plugin/plugin.json'
        if (Test-Path -LiteralPath $manifestPath -PathType Leaf) {
            $manifest = Get-Content -LiteralPath $manifestPath -Encoding UTF8 | ConvertFrom-Json
            if ($manifest.name -eq 'taskboard-pane') { $candidate }
        }
    })
    if ($candidates.Count -ne 1) {
        throw "Expected exactly one installed taskboard-pane mod; found $($candidates.Count). Specify -InstalledModPath."
    }
    $InstalledModPath = $candidates[0]
}
$target = (Resolve-Path -LiteralPath $InstalledModPath).Path
$allowedRoot = [IO.Path]::GetFullPath($devMods).TrimEnd('\') + '\'
if (-not $target.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase) -or
    (Split-Path -Leaf $target) -ne 'taskboard-pane') {
    throw 'Target must be an installed taskboard-pane beneath the current user .claude/dev-mods directory.'
}
$targetManifest = Get-Content -LiteralPath (Join-Path $target '.claude-plugin/plugin.json') -Encoding UTF8 | ConvertFrom-Json
if ($targetManifest.name -ne 'taskboard-pane') { throw 'Installed mod identity mismatch.' }
$files = @('.claude-plugin/plugin.json', 'hooks/hooks.json', 'hooks/register.tsx', 'hooks/taskboard.test.ts', 'types/index.d.ts')
$changed = @($files | Where-Object {
    $destination = Join-Path $target $_
    -not (Test-Path -LiteralPath $destination -PathType Leaf) -or
    (Get-FileHash -LiteralPath (Join-Path $source $_) -Algorithm SHA256).Hash -ne
    (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash
})
Write-Output "Installed mod: $target"
if (-not $changed.Count) { Write-Output 'Installed mod matches source; no changes needed.'; exit 0 }
if ($Check) {
    $changed | ForEach-Object { Write-Output "OUTDATED: $_" }
    exit 1
}
$backupRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../work/claude-mod-backups'))
$backup = Join-Path $backupRoot ((Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N'))
foreach ($relative in $changed) {
    $destination = Join-Path $target $relative
    if (Test-Path -LiteralPath $destination -PathType Leaf) {
        $backupFile = Join-Path $backup $relative
        New-Item -ItemType Directory -Path (Split-Path -Parent $backupFile) -Force | Out-Null
        Copy-Item -LiteralPath $destination -Destination $backupFile
    }
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $source $relative) -Destination $destination -Force
    if ((Get-FileHash -LiteralPath (Join-Path $source $relative) -Algorithm SHA256).Hash -ne
        (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash) {
        throw "Hash verification failed: $relative. Backup: $backup"
    }
    Write-Output "UPDATED: $relative"
}
Write-Output "Backup: $backup"
Write-Output 'Installed mod synchronized. In an existing Claude Code App session run /reload-plugins, then /taskboard.'
