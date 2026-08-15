param(
    [string]$Destination = (
        Join-Path $PSScriptRoot `
            "..\android\app\src\main\cpp\vendor\libdivecomputer"
    )
)

$ErrorActionPreference = "Stop"

$pinPath = Join-Path $PSScriptRoot `
    "..\android\app\src\main\cpp\libdivecomputer.pin"
$pin = @{}
foreach ($line in Get-Content -LiteralPath $pinPath) {
    if ($line -match "^([^=]+)=(.*)$") {
        $pin[$Matches[1]] = $Matches[2]
    }
}

$repository = $pin["repository"]
$commit = $pin["commit"]
$version = $pin["version"]
if ($repository -notmatch "^https://") {
    throw "libdivecomputer.pin must use an HTTPS repository URL."
}
if ($commit -notmatch "^[0-9a-f]{40}$") {
    throw "libdivecomputer.pin must contain a full commit."
}
if ($version -notmatch "^(\d+)\.(\d+)\.(\d+)(?:-.+)?$") {
    throw "libdivecomputer.pin is incomplete or invalid."
}
$versionMajor = $Matches[1]
$versionMinor = $Matches[2]
$versionMicro = $Matches[3]
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
    -replace "@DC_VERSION@", $version `
    -replace "@DC_VERSION_MAJOR@", $versionMajor `
    -replace "@DC_VERSION_MINOR@", $versionMinor `
    -replace "@DC_VERSION_MICRO@", $versionMicro
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
