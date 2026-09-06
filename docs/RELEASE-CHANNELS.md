# Release channels and web/APK parity

This is the canonical release and parity procedure. For the pinned stable
record, recipe invariants, and F-Droid history, use [FDROID-BUILD.md](FDROID-BUILD.md).
For current published Preview identity, read the [production feed](https://divelog.fishese.cc/whats-new.json)
and [GitHub release](https://github.com/fishese/diveframe/releases/tag/preview).
Do not copy rolling Preview version numbers into multiple handoff documents.

## Channels

| Surface | Identity | Build and delivery |
| --- | --- | --- |
| Web/PWA | DiveFrame; no Android version code | Cloudflare Workers Builds deploys GitHub `main` to https://divelog.fishese.cc |
| Preview APK | `cc.fishese.divelog.preview`; DiveFrame Preview | Explicit `assemblePreview`; `preview.<run>.<short-sha>`; code `100000 + run`; mutable `preview` release and `diveframe-preview.apk` |
| Stable production/F-Droid | `cc.fishese.divelog`; DiveFrame | Default `assembleRelease`; semantic version; immutable `vMAJOR.MINOR.PATCH` source tag and matching `fdroid-v%v` reference |

Preview and production are separately installable, use separate private data,
and have independent signing/distribution. Transfer data with an app-data
backup. The old nightly/debug publication paths are retired; do not create
new nightly releases or use a `releases/latest` debug download URL.

The F-Droid candidate may intentionally lag behind web and Preview while
changes are tested. Publishing web/Preview does not authorize a stable version
bump, stable/reference tag, F-Droid recipe edit, or MR update.

## Source and parity rules

Record the exact pushed source SHA before publishing. Web and APK share the
same intended application behavior. Shared UI, parsers, exports, charting,
translations, save/backup contracts, catalog data, and client dependencies
require a web deployment and a new Preview APK from that source.

| Change | Web deployment | New Preview APK |
| --- | --- | --- |
| Shared client behavior, bundled assets/data, or dependencies | Yes | Yes |
| Android bridge, native dependency, manifest, or Capacitor behavior | If shared code changed | Yes |
| Hosted API/CORS only | Yes | Usually no; test the installed APK against production |
| Browser-only PWA/service-worker behavior | Yes | No, if packaged behavior is unchanged |
| Update-feed content, tests, or documentation only | As the hosting integration requires | No |

A later feed-only or documentation-only `main` commit may intentionally leave
the APK at the earlier runtime SHA. Record that distinction in the release
record; exact checkout equality and runtime parity are different checks.

Deliberate platform differences:

- Web uses browser file handling, a browser-origin IndexedDB partition, and a
  service worker. Android uses bundled static assets, native Downloads/share,
  and its own WebView storage; the web service worker is disabled there.
- Web calls relative hosted APIs. Android uses the configured production API
  origin and approved Capacitor CORS origins.
- Classic Shearwater Bluetooth and original-photo-location access use Android
  bridges. Browser photo metadata depends on what its picker supplies.
- Both APK variants use the same shared client and native bridges. Only their
  package identity, label, version, signing, and distribution differ.

Preserve current saves in both surfaces. Prefer additive schema changes with
safe defaults and test representative current-save reads, edits, and backup
round trips. Pre-v8 migration saves do not need support; current saves do.

## Authorized web and Preview publication

1. Inspect `git status --short --branch`, fetch remote `main`, and reconcile
   changes without overwriting user work. Read applicable `AGENTS.md` files.
2. Run `npm test` and `npm run lint`. For shared/native changes run
   `npm run native:sync` and the affected Android build checks.
3. Commit only reviewed source, tests, and public documentation. Keep personal
   fixtures, generated APKs, local notes, and logs out of the commit.
4. Push the intended source to `main`. Verify its **Workers Builds: diveframe**
   check succeeds, then check the hosted app.
5. Dispatch `.github/workflows/preview-apk.yml` on that source. It also runs
   on a schedule. Wait for both APK publication and its dependent feed job.
6. Inspect the actual APK package, label, version name/code, ABI, signature, and
   SHA-256. Confirm source SHA agreement between workflow, mutable tag, release
   notes, and feed. Confirm both hosted feed endpoints advertise the APK.
7. Record the completed publication once under `docs/releases/`, with links
   to CI and the release. A record-only follow-up does not need another APK.

Example dispatch and inspection:

```powershell
gh workflow run preview-apk.yml --repo fishese/diveframe --ref main
gh run list --repo fishese/diveframe --workflow preview-apk.yml --limit 3
gh release view preview --repo fishese/diveframe
```

The workflow builds `github.sha` using explicit Preview Gradle properties,
then signs with the existing Actions secrets. Before publication it checks the
signed manifest and rejects obsolete reruns. Publication aligns only the
mutable `preview` tag with that source; immutable stable/reference tags are
never touched. Changing a release's `target_commitish` alone is insufficient
to move an existing Git tag.

Only after the release succeeds may the workflow advance
`public/whats-new.json`. Each feed push attempt verifies the release source,
exact version notes, uploaded APK digest, and Preview tag. A three-attempt
retry refreshes `main` after push conflicts. Older versions and reuse of a
version code for another source are rejected; identical reruns preserve
`updatedAt`. The stable `channels.fdroid` entry remains independent.

If publication succeeds but feed verification fails, the run must remain
visibly failed. Inspect and repair the specific discrepancy before rerunning
the feed job. Do not advertise a guessed version or repoint F-Droid at Preview.

## Local Android validation

From the repository root:

```powershell
npm run native:sync
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
Push-Location android
.\gradlew.bat --no-daemon assembleRelease
.\gradlew.bat --no-daemon "-PpreviewVersionCode=100001" "-PpreviewVersionName=preview.1.local" assemblePreview
Pop-Location
```

The example Preview identity is for local validation only, not publication.
Production must build through its default path without Preview properties.
Local unsigned outputs under `android/app/build/outputs/apk/` are not signed
release/reference artifacts. Build failure must stop synchronization rather
than copying a previous static export.

## Stable/F-Droid gate

Stable updates require a separate explicit release request after testing.
Follow [FDROID-BUILD.md](FDROID-BUILD.md) for production versioning,
reproducibility checks, immutable source/reference tags, and the recipe.

Automatic updates must remain restricted to:

```yaml
AutoUpdateMode: Version
UpdateCheckMode: Tags ^v[0-9]+\.[0-9]+\.[0-9]+$
UpdateCheckData: android/app/build.gradle|versionCode\s+(\d+)|.|versionName\s+"([^"]+)"
```

Neither `preview`, `nightly`, untagged `main`, nor `fdroid-v...` matches
this gate. Never use Preview as F-Droid source or reference. Do not merge or
comment on the F-Droid MR without an explicit request.

## Documentation ownership

- This file owns release/parity procedures and the change-to-release decision.
- [FDROID-BUILD.md](FDROID-BUILD.md) owns stable identity and recipe details.
- [releases/](releases/) contains dated publication evidence.
- [../HANDOFF.md](../HANDOFF.md) is a short maintainer starting point.
- [archive/](archive/) retains superseded public snapshots. Local-only design
  records remain in ignored local archives and are not published.

Before relying on any dated record, verify live release/workflow/feed state.
Use `glab` directly for authenticated read-only GitLab inspection.
