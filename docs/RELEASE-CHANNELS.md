# DiveFrame release channels and web/APK parity

Last verified: 2026-08-13 (Asia/Singapore)

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
`v1.0.21` as a Preview tag or release name; it is reserved for the existing
production/F-Droid history.

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

The current MR is pinned to production commit
`994a9571e8013672e8e6a91e10b361733a59251b`; Preview changes do not require
changing that MR or recipe. Only reviewer feedback or a concrete F-Droid
failure justifies touching the submission metadata.

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

- `git rev-parse HEAD` is the commit intended for both web and APK.
- `npm test` passes.
- `npm run native:sync` completed from that checkout.
- Production metadata reports `cc.fishese.divelog` and one release APK.
- Preview metadata reports `cc.fishese.divelog.preview` only when
  `assemblePreview` was explicitly requested.
- The APK version name/code match the release notes and workflow properties.
- The workflow URL, release tag, asset name, and documentation all refer to
  Preview consistently.
- The latest Preview release target SHA is the intended shared runtime commit,
  or any lag is explicitly recorded as intentional.
- The F-Droid recipe still uses `subdir: android/app`, no `output`, the
  production default build, and the required `Binaries:` formatting.
- F-Droid recipe, pinned commit, and stable release conventions remain
  untouched unless the task explicitly concerns a stable F-Droid update.
