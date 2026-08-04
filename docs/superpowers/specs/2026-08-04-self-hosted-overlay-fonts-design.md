# 2026-08-04 self-hosted overlay fonts

Approved in chat: commit OFL WOFF2 under `public/fonts/` plus a Node
refresh script (option C). Keep Noto Sans TC as the default overlay face.
F-Droid release-process changes are out of scope for this implementation;
only a docs outline follows after fonts land.

## Goal

Stop depending on `fonts.googleapis.com` / `fonts.gstatic.com` at runtime so
web, PWA, and the Android APK can use overlay fonts offline and are closer to
F-Droid readiness. Bundle the same curated OFL families the composer already
exposes.

## Non-goals

- Removing Noto Sans TC or switching the default to `SYSTEM_OVERLAY_FONT_STACK`
- Session-custom overlay fonts (`lib/session-overlay-font.ts` was started and
  removed unfinished; revisit later with session-only storage if needed)
- Changing APK signing, GitHub release channel, or F-Droid publication now
- Preloading every WOFF2 in the PWA `APP_SHELL` (would bloat first install)
- PowerShell one-liner downloads (Defender false positive risk); Node only

## Approach

Static CSS + committed WOFF2 (Approach 1):

1. Node script downloads the current Google Fonts CSS query and WOFF2 files.
2. Script writes local `@font-face` CSS and stable filenames under
   `public/fonts/`.
3. Commit fonts, generated CSS, and license notices.
4. `app/globals.css` imports the local CSS instead of Google Fonts.
5. Normal `build` / `native:sync` do not re-download; the script is a refresh
   tool for maintainers.

## Families and weights

Match the existing Google Fonts import in `app/globals.css`:

| Family | Weights | Notes |
| --- | --- | --- |
| Noto Sans TC | 400, 500, 600, 700 | Keep as default; dominates size (~4MB) |
| Inter | 400, 500, 600, 700 | |
| Outfit | 400, 500, 600, 700 | |
| Space Mono | 400, 700 | |
| Huninn | as currently served | Rounded TC + Latin |
| Device Sans | n/a | Unchanged system stack in `lib/composer-fonts.ts` |

Do not add Noto Sans HK, Noto Serif TC, or LXGW WenKai TC.

Weight subsetting and aggressive CJK unicode-range filtering are not required
for this pass: earlier probes showed little size win given the import is
already weight-limited, and unicode-range filtering barely helped.

## Layout

```text
public/fonts/*.woff2
public/fonts/OFL-*.txt          # per-family OFL text where practical
app/overlay-fonts.css           # generated @font-face; committed
scripts/bundle-overlay-fonts.mjs
```

`package.json` script:

```text
"bundle:overlay-fonts": "node scripts/bundle-overlay-fonts.mjs"
```

## Script behavior

`scripts/bundle-overlay-fonts.mjs`:

- Request the Google Fonts CSS API with a user-agent that returns WOFF2.
- Use the same family/weight query currently in `globals.css`.
- Parse `url(...)` entries, download each file into `public/fonts/` with
  stable names (e.g. `noto-sans-tc-400.woff2`).
- Emit `app/overlay-fonts.css` with `@font-face` rules whose `src` uses
  root-absolute `/fonts/...` paths (works for web and Capacitor
  `https://localhost`).
- Fetch or copy SIL OFL license text into `public/fonts/` when practical;
  otherwise document upstream OFL URLs in `ASSET-LICENSES.md`.
- Idempotent: safe to re-run; overwrites generated CSS and font binaries.
- Not a required step of `npm run build` or `npm run native:sync` once fonts
  are committed.

## App wiring

- `app/globals.css`: remove the Google Fonts `@import`; import
  `./overlay-fonts.css` (or the equivalent path vinext/Vite accepts).
- `lib/composer-fonts.ts`: keep existing family names and
  `ensureOverlayFont` weight loads (`400`–`700`) so canvas preview/export
  continues to resolve the same faces.
- `SYSTEM_OVERLAY_FONT_STACK` remains documented for a possible future
  default if Noto is dropped.
- Capacitor path unchanged: committed files under `public/fonts/` are included
  via the existing static native export into `dist-native`.
- PWA: do not add all WOFF2 files to `APP_SHELL`. First Compose/CSS use loads
  fonts from the origin; the existing service-worker fetch handler may cache
  successful responses.

## Licensing

Update `ASSET-LICENSES.md` with an overlay-fonts section:

- List Noto Sans TC, Inter, Outfit, Space Mono, and Huninn.
- State SIL Open Font License 1.1.
- State binaries are unmodified redistributions bundled for offline use.
- Note Google Fonts CSS/API was only the acquisition path, not a runtime
  dependency.
- Link to the OFL and to any committed `public/fonts/OFL-*.txt` files.

Update About copy (`aboutAssetLicense` in en / zh-Hant / ja) to mention
bundled OFL overlay fonts alongside the Bubbles CC BY-SA notice, pointing at
`ASSET-LICENSES.md`.

## Tests

Extend `tests/app-contract.test.mjs` (or a small sibling):

- `app/globals.css` must not match `fonts.googleapis.com` or
  `fonts.gstatic.com`.
- Must reference the local overlay font CSS.
- Overlay CSS must declare `@font-face` for Noto Sans TC, Inter, Outfit,
  Space Mono, and Huninn with `/fonts/` WOFF2 sources.
- Expected WOFF2 files exist under `public/fonts/`.
- Keep existing `lib/composer-fonts.ts` family assertions.

## Docs

- `docs/USER-GUIDE.md`: stop saying public webfonts may be downloaded; say
  overlay fonts are bundled.
- `HANDOFF.md` and a short session note: self-hosted fonts done; classify as
  **APK-affecting** (shared client assets under `public/` + CSS).
- This spec under `docs/superpowers/specs/`.

## Success criteria

1. No Google Fonts CSS or network dependency for overlay faces at runtime.
2. Font files are present in the repository and in native static export / APK
   assets.
3. `ensureOverlayFont` and the composer continue to use the same family names.
4. License documentation is accurate for redistributors and F-Droid reviewers.
5. Automated tests pass; manual airplane-mode / network-blocked Compose check
   confirms preview/export still render selected overlay fonts.

## After fonts: F-Droid path (outline only)

Do not change the release process in the fonts implementation. After fonts
land, add a short maintainer outline (session note and/or
`docs/FDROID-PATH.md`) covering:

- Move off unsigned/debug APK hosting toward F-Droid rather than maintaining a
  long-lived private keystore for the current debug channel.
- Users must export an app-data backup before any signing-key change;
  signature changes may require uninstall and wipe private IndexedDB.
- Reproducible build inputs: pinned Node/JDK, vendored fonts, `native:sync`,
  Gradle assemble.
- LGPL / libdivecomputer: corresponding source and compliance checklist for
  any store or F-Droid build.
- ABI / versioning policy, and whether `/android` should keep pointing at
  GitHub `releases/latest` or move to an F-Droid / release-page link.

Open audit items remain separate: streamed backup encode/restore, large React
splits, and the BLE/LGPL release checklist.
