# DiveFrame F-Droid build and update guide

Last verified: 2026-08-17 (Asia/Singapore)

Read this before changing the F-Droid metadata, creating a production
release, or preparing a new F-Droid merge-request update. The canonical
production/Preview/web channel rules are in
[`RELEASE-CHANNELS.md`](RELEASE-CHANNELS.md); this document records the
F-Droid-specific build contract and the failure that occurred during MR
!45472.

## Current boundary

- F-Droid app ID: `cc.fishese.divelog`.
- F-Droid must build the default production `assembleRelease` output.
- Preview is a separate app: `cc.fishese.divelog.preview`. Preview builds
  must never be submitted as F-Droid source or reference APKs.
- The current submission MR is
  [!45472](https://gitlab.com/fdroid/fdroiddata/-/merge_requests/45472).
- The MR recipe is still pinned to production commit
  `4dcdaa659af3fe6a873b13ed28a898afe2a774ca`, version `1.0.25`, version code
  `26`, and immutable source tag `v1.0.25`.
- The published replacement stable candidate is `1.0.26` / code `27`, source
  `dc52cef859ede44b9b7d3a4741251cc96d9244e6`, immutable tag `v1.0.26`.
  Its developer-signed reference is complete, but the MR does not represent
  it until the exact recipe diff is committed and a new pipeline passes.
- Current web `main` intentionally includes a web-only follow-up that hides
  native update controls from the hosted web/PWA. It is not an Android or
  F-Droid source; stable 1.0.26 remains pinned to `dc52cef`.
- Stable-only auto-update is enabled with `AutoUpdateMode: Version` and
  `UpdateCheckMode: Tags ^v[0-9]+\.[0-9]+\.[0-9]+$`. `UpdateCheckData` reads
  the plain production `versionCode` / `versionName` lines from
  `android/app/build.gradle`. Preview versions are applied only on the
  preview variant and must not be captured by that regex. Because the
  first-inclusion MR is still open, a new stable tag still needs a recipe
  update; after merge, matching tags can be picked up automatically.

The staging recipe is:

`D:\Projects\Dive log\fdroid-prep\cc.fishese.divelog.yml`

The fork copy used for the MR is:

`D:\Projects\Dive log\fdroid-prep\fdroiddata\metadata\cc.fishese.divelog.yml`

Keep those two files identical apart from line-ending normalization.

## Recipe invariants

These fields are coupled to the current Android project layout:

```yaml
Builds:
  - versionName: 1.0.25
    versionCode: 26
    commit: 4dcdaa659af3fe6a873b13ed28a898afe2a774ca
    subdir: android/app
    gradle:
      - yes
```

### `subdir` must be the Android app directory

F-Droid runs the Gradle build and performs automatic APK discovery relative
to `subdir`. In this project the output is generated at:

```text
android/app/build/outputs/apk/release/
```

Therefore the recipe must use `subdir: android/app`. Do not change it to
`android` merely because the Gradle wrapper is stored there. With
`subdir: android`, Gradle can still finish successfully, but F-Droid looks
for the APK under the wrong build root and reports that it found no output
APKs.

### Do not restore `output`

The reviewer requested that the explicit `output` field be removed. With
`subdir: android/app`, F-Droid's normal Gradle APK discovery finds the
release APK. Adding an output glob back is likely to hide a future working
directory mistake and will contradict the reviewer-approved shape.

If the Android project layout changes, first identify the directory that
contains the generated `build/outputs/apk/release` tree. Set `subdir` to that
directory, adjust recipe command paths, and run the full F-Droid validation
pipeline before changing anything else.

### Recipe command working directories

F-Droid executes `prebuild` and `build` from the resolved `subdir`, currently
`android/app`. That explains the repository-root transition used to validate
and prepare the pinned native submodule:

```yaml
submodules: true
prebuild:
  - cd ../..
  - sh scripts/fetch-libdivecomputer.sh
  - npm ci
  - npm run native:sync
build:
  - cd ../..
  - npm ci --offline
  - npm run native:sync
```

The build starts in `android/app`; the native preparation and Node commands
require `cd ../..`. Do not change only `subdir` and leave the old `cd ..`
transition in place.

The current recipe also deliberately pins:

- Node/npm installation from Debian forky because the project requires Node
  22.13+ and the native web build uses current tooling;
- NDK `27.0.12077973`;
- the `libdivecomputer` Git submodule revision, matching
  `android/app/src/main/cpp/libdivecomputer.pin`, and generated revision
  header; and
- the offline second `npm ci` after the dependency cache has been prepared.

These are build inputs, not optional cleanup. Keep them reproducible and do
not replace the pinned submodule with an unpinned branch or network checkout
in an F-Droid build.

### `libdivecomputer` update contract

The app repository tracks `libdivecomputer` as a Git submodule at
`android/app/src/main/cpp/vendor/libdivecomputer`. The source tag's gitlink is
the dependency source of truth for F-Droid. The adjacent
`libdivecomputer.pin` records the same full commit for generated version
headers, the native build ID, and runtime provenance. They must always match.

GitHub release workflows check out submodules recursively. The F-Droid recipe
uses `submodules: true`, does not declare `srclibs`, and runs
`scripts/fetch-libdivecomputer.sh` only to verify the checked-out commit and
generate `version.h` / `revision.h`; it performs no dependency fetch when the
submodule is initialized. This lets `AutoUpdateMode: Version` inherit the
exact dependency pointer from each immutable DiveFrame source tag instead of
copying an obsolete recipe-level hash.

When intentionally updating libdivecomputer, update the gitlink and
`libdivecomputer.pin` together, regenerate/verify the source manifest if
upstream files changed, run both Preview and production native checks, and
publish the change only through a new immutable stable tag. Never point the
submodule at a branch or advance it merely because upstream HEAD changed.

### Preserve the `Binaries` formatting

The metadata validator used by the MR requires the trailing space after the
`Binaries:` colon:

```yaml
Binaries:␠
  https://github.com/fishese/diveframe/releases/download/fdroid-v%v/diveframe-%v.apk
```

The `␠` marker above represents one literal U+0020 space after the colon;
the actual recipe must contain that literal trailing space. Editors or
formatters that trim it can make `fdroid rewritemeta` fail even when the URL
is correct. Check the exact line before pushing:

```powershell
$line = (Get-Content 'D:\Projects\Dive log\fdroid-prep\cc.fishese.divelog.yml' |
  Select-String '^Binaries:').Line
if ($line -cne 'Binaries: ') { throw "Binaries line must retain its trailing space" }
```

## What happened in MR !45472

The first reviewer-fix commit, `011d118ef`, removed `output` and retained
`subdir: android`. Pipeline
[2753810915](https://gitlab.com/fdroid/fdroiddata/-/pipelines/2753810915)
showed:

1. F-Droid prepared the source successfully.
2. `npm run native:sync` completed.
3. Gradle completed `:app:assembleRelease` successfully.
4. F-Droid then failed with `Failed to find any output apks`.

The failure was APK discovery, not a Gradle or source build failure. The
corrective commit `1af892567` changed the recipe to `subdir: android/app`,
made the native paths app-relative, and changed both repository-root Node
command transitions to `cd ../..`. Pipeline
[2753996239](https://gitlab.com/fishese/fdroiddata/-/pipelines/2753996239)
then passed all nine jobs, including `fdroid build` and `check apk`.

When a future build says Gradle succeeded but no APK was found, inspect these
in this order:

1. the resolved `subdir`;
2. the actual `build/outputs/apk/release` location;
3. whether the Gradle task produced one release APK; and
4. whether recipe commands accidentally ran from the app directory when they
   expected the repository root.

## Reference APK and reproducibility contract

F-Droid builds from source and signs the distributed APK with its own key.
`Binaries` points to a developer-signed reference APK so F-Droid can compare
the built binary reproducibly. The reference APK and source commit must be
the same production build:

```text
production source tag: vMAJOR.MINOR.PATCH
reference tag:         fdroid-vMAJOR.MINOR.PATCH
reference asset:       diveframe-MAJOR.MINOR.PATCH.apk
application ID:        cc.fishese.divelog
Gradle task:            assembleRelease
```

The reference workflow is
`.github/workflows/fdroid-reference-apk.yml`. Its current `1.0.26` values
are hard-coded together for the stable release and were run from the exact
`v1.0.26` source commit. Never use the mutable `preview` release as the
reference asset.

## Verified stable release update

- Stable source/tag: `dc52cef859ede44b9b7d3a4741251cc96d9244e6` / `v1.0.26`
- Production release: https://github.com/fishese/diveframe/releases/tag/v1.0.26
- Reference workflow: https://github.com/fishese/diveframe/actions/runs/32377898462
- Reference release: https://github.com/fishese/diveframe/releases/tag/fdroid-v1.0.26
- Reference asset: `diveframe-1.0.26.apk`, `15765025` bytes,
  SHA-256 `33146E1483FFBF3BA61C34C154ACCA7CE6AB5754E6E8DBC53C18AD2AF6AE66F4`
- APK identity: `cc.fishese.divelog`, `DiveFrame`, version `1.0.26` / code
  `27`, ABI `arm64-v8a`; signer `CN=Fishese`, certificate digest
  `90311d4a659f32a767199164791dba0aa5e05ffa5ed9f73b93baffc9112bb25a`
- Current recipe/MR commit (still 1.0.25):
  `267a512cb00f21f5bfb1ddc97f9a54c38afe36a5`
- MR/pipeline: [!45472](https://gitlab.com/fdroid/fdroiddata/-/merge_requests/45472),
  [pipeline 2766264516](https://gitlab.com/fishese/fdroiddata/-/pipelines/2766264516)

Pipeline 2766264516 passed all nine jobs and validates the existing 1.0.25
recipe, stable-tag-only auto-update against the plain production Gradle version
lines, and the reviewer-requested Git submodule dependency path. The recipe uses
`submodules: true`; the source gitlink and `libdivecomputer.pin` both
resolve to `8e564eb5cf9fb4318af3d540895abb916e1809b0`. It still uses
`subdir: android/app`, has no `output`, and retains all pinned native inputs.

For 1.0.26, source publication, reference publication, and signed-APK
inspection are complete. The recipe update and its pipeline are still pending;
do not claim the MR is on 1.0.26 until both finish. Maintainer review and merge
remain outside the release-preparation workflow.

## Repeatable F-Droid update checklist

Use this sequence for a future accumulated production/F-Droid update:

1. Accumulate and test shared changes through the separate Preview channel.
2. Confirm the web repository is clean and record the intended production
   commit. Run `npm test`, `npm run native:sync`, and the default Android
   `assembleRelease` from that same checkout.
3. Set the production version name and code. Do not pass Preview properties
   and do not change the default build to `assemblePreview`.
4. Create the immutable `vMAJOR.MINOR.PATCH` source tag. Never move or reuse
   a production tag.
5. Update and run the signed reference workflow from that exact commit. Verify
   the reference APK has the production ID, stable version, expected version
   code, and the developer signing key.
6. Update both recipe copies with the same commit/version/code. Preserve
   `subdir: android/app`, remove `output`, preserve the `Binaries:` trailing
   space, keep `submodules: true`, and retain the pinned NDK/native build
   commands. Do not reintroduce a recipe-level `srclibs` commit.
7. Run metadata validation and a clean F-Droid build. The MR pipeline should
   pass `fdroid rewritemeta`, `fdroid lint`, schema validation, source checks,
   `checkupdates`, `fdroid build`, and `check apk`.
8. Compare the F-Droid build identity and reference identity: package ID,
   version name/code, release output path, source commit, and reference APK
   URL must all agree.
9. Keep Preview and F-Droid work separate. A Preview workflow run or a web
   typography/content change does not justify changing the F-Droid MR.
10. Preserve the enabled stable-only metadata updates:

    ```yaml
    AutoUpdateMode: Version
    UpdateCheckMode: Tags ^v[0-9]+\.[0-9]+\.[0-9]+$
    UpdateCheckData: android/app/build.gradle|versionCode\s+(\d+)|.|versionName\s+"([^"]+)"
    ```

    The production `vMAJOR.MINOR.PATCH` tag is the update gate. Ordinary
    `main` commits and mutable Preview tags do not trigger F-Droid. Never
    broaden the pattern to Preview, nightly, debug, or `fdroid-v...`
    reference tags.

## Drift-prevention rule

Web/PWA, Preview, and production/F-Droid share the client source and must
remain behaviorally aligned. The deliberate differences are:

| Surface | Deliberate difference | Must remain shared |
| --- | --- | --- |
| Web/PWA | Hosted deployment, browser origin, browser capabilities, service worker | Client model, parsers, translations, IndexedDB/backup contracts, assets, and user-facing behavior |
| Preview APK | `assemblePreview`, `.preview` application ID, Preview label, mutable tag, Preview version range, GitHub signing key | The same shared client source and native integration behavior as production |
| Production/F-Droid APK | Default `assembleRelease`, production application ID, stable version, immutable release/reference tags, F-Droid signing key | The same production source commit and shared behavior; only signing/distribution/version metadata differs |

Before publishing a shared change, compare the web commit, Preview workflow
target SHA, and intended production/F-Droid commit. If they differ, record the
difference as intentional. A web deployment never updates an installed APK,
and a Preview build never updates F-Droid.
