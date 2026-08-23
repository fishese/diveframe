# DiveFrame release channels and web/APK parity

Last verified: 2026-08-23 (Asia/Singapore)

This is the canonical release note for future sessions. Read it before
changing a version, release tag, APK workflow, or F-Droid metadata. The
F-Droid-specific build contract is in [`FDROID-BUILD.md`](FDROID-BUILD.md).
The ignored local `docs/WEB-APK-SYNC.md`, when present, is a companion
checklist; it is not required to understand or follow the rules in this
document.

## Source-commit rule

The hosted web app and every published APK must be traceable to an exact
source commit. A web deployment and an APK are considered matching only when
both were built from the same commit SHA.

For a shared change:

1. Finish the change and run `git status --short`; do not publish from an
   unintended dirty checkout.
2. Run `npm test` from the repository root (`D:\Projects\Dive log\web`).
3. Push the intended commit to `main` and record `git rev-parse HEAD`.
4. Let the web deployment use that pushed commit.
5. Run the Preview workflow or the production/F-Droid release process from
   that same commit. Do not build an APK from a later or earlier checkout.
6. Put the source commit, application ID, version name, and version code in
   the release notes or handoff record.

Documentation-, test-, and server-only changes may skip a new APK, but the
release record must explicitly say that the APK intentionally remains at an
older commit.

## Channel matrix

| Surface | Application ID | Label | Build/version rule | Tag or URL |
| --- | --- | --- | --- | --- |
| Hosted web/PWA | N/A | DiveFrame | Deploy from `main`; no APK version code | `https://divelog.fishese.cc` |
| Production APK | `cc.fishese.divelog` | DiveFrame | Default `assembleRelease`; stable `MAJOR.MINOR.PATCH` version | Immutable `vMAJOR.MINOR.PATCH` |
| Preview APK | `cc.fishese.divelog.preview` | DiveFrame Preview | Explicit `assemblePreview`; `preview.<run>.<short-sha>`; code `100000 + run` | Mutable `preview` / `diveframe-preview.apk` |
| F-Droid/reference APK | `cc.fishese.divelog` | DiveFrame | Production `assembleRelease`; recipe supplies the stable version/code | Reference tag `fdroid-v%v`; recipe-pinned stable commit |

Production tags are immutable and must never be moved or reused. The mutable
`preview` tag is never a production or F-Droid source tag. Do not use
`v1.0.21`, `v1.0.27`, or current `v1.0.28` as a Preview tag or release name;
they are
reserved for the existing production/F-Droid history.

Preview and production have separate Android application IDs, provider
authorities, private WebView storage, and IndexedDB partitions. They can be
installed together but do not share data. Move a logbook with the app-data
export/import flow. The legacy nightly APK used the production ID and is
historical; do not create new `nightly` artifacts.

## Build commands

Run these from `D:\Projects\Dive log\web` after the source commit is fixed.

Prepare the exact web assets that the APK will package:

```powershell
npm run native:sync
```

Build production. This is the default/F-Droid path and must produce only the
production APK:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
Push-Location android
..\gradlew.bat --no-daemon assembleRelease
Pop-Location
```

Build Preview only when explicitly requested. Do not pass Preview properties
to a production release build:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$previewRun = 123
$previewSha = (git rev-parse --short=7 HEAD)
$previewCode = 100000 + $previewRun
$previewName = "preview.$previewRun.$previewSha"
Push-Location android
..\gradlew.bat --no-daemon `
  "-PpreviewVersionCode=$previewCode" `
  "-PpreviewVersionName=$previewName" `
  assemblePreview
Pop-Location
```

The signed GitHub workflow is
`.github/workflows/preview-apk.yml`; it checks out `${{ github.sha }}`, runs
`npm run native:sync`, and assembles `assemblePreview`. Its output is
published as the mutable `preview` release with asset
`diveframe-preview.apk`.

## F-Droid guardrails

The staging recipe is
`D:\Projects\Dive log\fdroid-prep\cc.fishese.divelog.yml`.

- Keep `subdir: android/app` and `gradle: yes` unless F-Droid explicitly
  requests a recipe change.
- Keep `submodules: true`; the stable source tag's libdivecomputer gitlink
  must match `android/app/src/main/cpp/libdivecomputer.pin`. Do not restore a
  separate recipe-level `srclibs` revision, which cannot follow auto-updates.
- `gradle: yes` selects the default production `assembleRelease` path here;
  it must not select or publish `assemblePreview`.
- Do not add a flavor or change the default task in order to publish Preview.
- Do not update the F-Droid recipe for mutable Preview builds.
- For a new F-Droid release, first accumulate/test changes through Preview,
  then create an immutable production `vMAJOR.MINOR.PATCH` tag, publish the
  matching `fdroid-v%v` reference APK, and update the recipe to that stable
  source/version only when requested.
- The F-Droid reference APK and source tag must come from the same production
  source commit. A Preview APK must never be used as the F-Droid reference.
- Automatic updates must remain restricted to exact immutable production tags:

  ```yaml
    AutoUpdateMode: Version
    UpdateCheckMode: Tags ^v[0-9]+\.[0-9]+\.[0-9]+$
    UpdateCheckData: android/app/build.gradle|versionCode\s+(\d+)|.|versionName\s+"([^"]+)"
  ```

  Untagged `main` commits, `preview`, `nightly`, debug tags, and
  `fdroid-v...` reference tags do not match and cannot trigger an update.

The newly published stable/F-Droid candidate is production commit
`1d676d2929be03d6786d777018dc77b7b757d7ef`, version `1.0.28`, version code
`29`, and immutable `v1.0.28` source tag. MR !45472 is still the first
inclusion and remains open. Its recipe now represents this release at head
`7882cd4beea3028ca39aaf39b2a7cb7ef64d971a`; pipeline `2783281904` passed all
nine jobs, including `fdroid build` and `check apk`.
After merge, F-Droid auto-update can add later matching tags without a manual
recipe edit.

Current `main` intentionally contains a web/feed and documentation follow-up
after stable source `1d676d2`. It records the completed release and advances
the hosted update feed; it has no behavioral effect in either Android package
and is not an APK source.

The current verified Preview release uses Android runtime commit
`a1ee14280824ae66904e0b99248f0c2324ac885a` (workflow run `32650696356`). It
is `preview.28.a1ee142`, version code `100028`, and its `15765025`-byte APK
has SHA-256
`4A13AB126891DEE2890363F84E5041F346FD2D849F55275358E3EDC1632CD2A0`.

## Current stable production/F-Droid release

The stable production source is commit
`1d676d2929be03d6786d777018dc77b7b757d7ef`, tagged immutably as `v1.0.28`.
It uses the default `assembleRelease` path, package
`cc.fishese.divelog`, version name `1.0.28`, and version code `29`.

The matching developer-signed F-Droid reference is published at
`fdroid-v1.0.28` as `diveframe-1.0.28.apk`:

- Production release: https://github.com/fishese/diveframe/releases/tag/v1.0.28
- Reference release: https://github.com/fishese/diveframe/releases/tag/fdroid-v1.0.28
- Reference workflow: https://github.com/fishese/diveframe/actions/runs/32648808269
- Size: `15765025` bytes; SHA-256:
  `13BE632B7EC6D5B3350A93627E04C5C2EACA5DE55F96325EF38484E7E1A80D38`
- ABI: `arm64-v8a`; signer: `CN=Fishese`, certificate digest
  `90311d4a659f32a767199164791dba0aa5e05ffa5ed9f73b93baffc9112bb25a`

The current F-Droid recipe commit is
`7882cd4beea3028ca39aaf39b2a7cb7ef64d971a`. MR !45472 remains open and
unmerged; pipeline `2783281904` passed all nine jobs and validates the 1.0.28
recipe, reference APK, stable-tag-only auto-update configuration, and plain
production Gradle version lines. The F-Droid source, reference release, and
recipe now resolve to the same stable source commit.

The latest reviewer note is **PASS WITH NOTES** and requests a Gradle-wrapper
`distributionSha256Sum`. Stable 1.0.28 retains Gradle's official
SHA-256 for the configured 8.14.2 `all.zip` distribution. A fresh isolated
download, production and Preview validation builds, the signed reference, and
the full F-Droid reproducibility pipeline all passed. The immutable 1.0.26 tags
were not moved or replaced.

Preview `a1ee142` includes the compact update UI from stable source `1d676d2`
plus the release feed and records. Preview is not a production source or
reference artifact. The
libdivecomputer dependency commit remains
`8e564eb5cf9fb4318af3d540895abb916e1809b0`.

## Requesting a production release

Use this instruction when accumulated changes are ready for F-Droid
production:

```text
Prepare the next stable DiveFrame production/F-Droid release from the latest
intended shared-runtime source. Read docs/RELEASE-CHANNELS.md and
docs/FDROID-BUILD.md completely before changing anything. Audit main and the
latest Preview, choose and record the exact stable source, run the complete
stable checks, select the next versionName/versionCode, and use the default
assembleRelease production path. Push the release commit, create immutable
vMAJOR.MINOR.PATCH and fdroid-vMAJOR.MINOR.PATCH tags at that same source,
publish and inspect the signed reference APK, and update all release records.
Treat creation of the vMAJOR.MINOR.PATCH tag as the F-Droid auto-update gate:
do not create it for Preview, test, documentation-only, or routine minor
changes. Never move or reuse tags, use a Preview APK as the reference, or
merge an F-Droid MR.
```

After the app is accepted, F-Droid's updater should generate future build
entries only from matching stable tags. Do not manually edit fdroiddata for
ordinary Preview/main changes; intervene only for a concrete automation
failure or maintainer request.

The exact F-Droid working-directory rule, `Binaries` whitespace requirement,
MR failure analysis, reference-APK contract, and future update checklist are
maintained in [`FDROID-BUILD.md`](FDROID-BUILD.md). Do not duplicate those
recipe details in a release note and risk letting the two procedures diverge.

## Shared source and deliberate channel differences

The web/PWA, Preview APK, and production/F-Droid APK are delivery surfaces for
the same client. Shared paths such as `app/`, `lib/`, `data/`, client-facing
`public/` assets, translations, IndexedDB/backup code, and shared dependencies
must not drift between them. A shared runtime change normally requires a new
web deployment and a new Preview APK from the same pushed commit.

The differences below are intentional and should not be treated as drift:

| Surface | Intentional difference | Release identity |
| --- | --- | --- |
| Web/PWA | Browser origin/capabilities, service worker, browser file handling, and Cloudflare delivery | Current `main` deployment; no Android version code |
| Preview APK | Explicit `assemblePreview`, `cc.fishese.divelog.preview`, Preview label, Preview version-code range, mutable `preview` tag, GitHub signing key | Regular test builds; separately installable |
| Production/F-Droid APK | Default `assembleRelease`, `cc.fishese.divelog`, stable version/code, immutable production and `fdroid-v...` tags, separate signing keys | Intentional accumulated release; F-Droid source build after approval |

Preview is the replacement for the old nightly test channel. Production is
not a second Preview stream: it is the stable build that F-Droid will build
and sign in the future. F-Droid may intentionally remain on an older stable
commit while `main`, the web deployment, and Preview continue to move forward.
That is release-channel policy, not accidental drift.

For each shared change, record three facts before publishing:

1. the pushed `main` commit used by the web deployment;
2. the commit SHA embedded in the Preview release; and
3. the production commit/tag intended for the next F-Droid release.

If the three SHAs differ, state why. A documentation-only change may leave an
APK at the prior runtime commit; a shared client change should not.

## Final drift checks

Before calling a release complete, verify all of the following:

- The build checkout's `git rev-parse HEAD` is the exact commit intended for
  the APK; if `main` has later documentation-only commits, record that
  deliberate difference and keep the APK source SHA pinned.
- `npm test` passes.
- `npm run native:sync` completed from that checkout.
- Production metadata reports `cc.fishese.divelog` and one release APK.
- Preview metadata reports `cc.fishese.divelog.preview` only when
  `assemblePreview` was explicitly requested.
- The APK version name/code match the release notes and workflow properties.
- The Preview workflow URL, mutable tag, asset name, package, and version all
  refer to Preview consistently; production/F-Droid records separately use
  the immutable stable tag, production package, and stable version.
- The latest Preview release target SHA is the intended shared runtime commit,
  or any lag is explicitly recorded as intentional.
- The F-Droid recipe still uses `subdir: android/app`, no `output`, the
  production default build, `submodules: true`, no `srclibs`, and the required
  `Binaries:` formatting.
- Auto-update remains `Version` with the exact stable-tag regex and
  `UpdateCheckData`; verify that Preview, nightly, debug, and `fdroid-v...`
  tags remain excluded.
- F-Droid recipe, pinned commit, and stable release conventions remain
  untouched unless the task explicitly concerns a stable F-Droid update.
