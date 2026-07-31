param(
    [string]$Destination = (
        Join-Path $PSScriptRoot `
            "..\android\app\src\main\cpp\vendor\libdivecomputer"
    )
)

$ErrorActionPreference = "Stop"

$repository = "https://github.com/libdivecomputer/libdivecomputer.git"
$commit = "8e564eb5cf9fb4318af3d540895abb916e1809b0"
$resolvedDestination = [System.IO.Path]::GetFullPath($Destination)
$workspace = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))

if (-not $resolvedDestination.StartsWith(
    $workspace + [System.IO.Path]::DirectorySeparatorChar,
    [System.StringComparison]::OrdinalIgnoreCase
)) {
    throw "Destination must remain inside the DiveFrame workspace."
}

if (Test-Path -LiteralPath $resolvedDestination) {
    $existingCommit = (& git -C $resolvedDestination rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or $existingCommit -ne $commit) {
        throw "Existing libdivecomputer checkout does not match the pinned commit."
    }
} else {
    $parent = Split-Path -Parent $resolvedDestination
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    & git init $resolvedDestination
    & git -C $resolvedDestination remote add origin $repository
    & git -C $resolvedDestination fetch --depth 1 origin $commit
    & git -C $resolvedDestination checkout --detach FETCH_HEAD
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to fetch the pinned libdivecomputer source."
    }
}

$versionHeader = Join-Path $resolvedDestination `
    "include\libdivecomputer\version.h"
$versionTemplate = Get-Content -Raw -LiteralPath (
    Join-Path $resolvedDestination "include\libdivecomputer\version.h.in"
)
$versionHeaderContent = $versionTemplate `
    -replace "@DC_VERSION@", "0.10.0-devel" `
    -replace "@DC_VERSION_MAJOR@", "0" `
    -replace "@DC_VERSION_MINOR@", "10" `
    -replace "@DC_VERSION_MICRO@", "0"
[System.IO.File]::WriteAllText(
    $versionHeader,
    $versionHeaderContent,
    [System.Text.UTF8Encoding]::new($false)
)

$revisionHeader = Join-Path $resolvedDestination "src\revision.h"
[System.IO.File]::WriteAllText(
    $revisionHeader,
    "#define DC_VERSION_REVISION `"$commit`"`n",
    [System.Text.UTF8Encoding]::new($false)
)

Write-Host "libdivecomputer $commit is ready at $resolvedDestination"
