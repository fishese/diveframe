# Self-Hosted Overlay Fonts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bundle OFL overlay fonts under `public/fonts/`, serve them via local `@font-face` CSS, and remove the runtime Google Fonts dependency for web and Android APK offline use.

**Architecture:** A maintainer Node script downloads the current Google Fonts CSS + WOFF2 files once, rewrites `src` to `/fonts/...`, and commits the binaries plus `app/overlay-fonts.css`. `app/globals.css` imports that local CSS instead of `fonts.googleapis.com`. Normal builds do not re-download.

**Tech Stack:** Node.js 22.13+, existing vinext/Next app CSS, Capacitor static export (`public/` → `dist-native`), `node:test` contract tests.

**Spec:** `docs/superpowers/specs/2026-08-04-self-hosted-overlay-fonts-design.md`

## Global Constraints

- Keep Noto Sans TC as the default overlay face; do not switch to `SYSTEM_OVERLAY_FONT_STACK`.
- Commit WOFF2 files (option C); do not gitignore them or require download on every build.
- Download/refresh only via Node (`scripts/bundle-overlay-fonts.mjs`); no PowerShell `-c` download one-liners.
- Do not change APK signing, GitHub release channel, or F-Droid publication in this plan (outline docs only).
- Do not add session-custom overlay fonts.
- Do not preload all WOFF2 files in `public/sw.js` `APP_SHELL`.
- Do not add Noto Sans HK, Noto Serif TC, or LXGW WenKai TC.
- Classification: **APK-affecting** (shared client assets under `public/` + CSS).

## File Structure

| File | Responsibility |
| --- | --- |
| `scripts/bundle-overlay-fonts.mjs` | Fetch Google Fonts CSS + WOFF2; write local CSS + license texts |
| `public/fonts/*.woff2` | Committed OFL font binaries |
| `public/fonts/OFL-*.txt` | Per-family SIL OFL license text |
| `app/overlay-fonts.css` | Generated local `@font-face` rules (committed) |
| `app/globals.css` | Import local overlay CSS; no Google Fonts URL |
| `package.json` | `bundle:overlay-fonts` script entry |
| `ASSET-LICENSES.md` | OFL overlay-font redistributor notice |
| `lib/app-i18n/{en,zh-Hant,ja}.ts` | About asset-license copy mentions bundled OFL fonts |
| `docs/USER-GUIDE.md` | Bundled fonts, not remote webfonts |
| `HANDOFF.md` | Status: self-hosted fonts |
| `docs/2026-08-04-self-hosted-fonts-session.md` | Session notes |
| `docs/FDROID-PATH.md` | Post-fonts F-Droid outline only |
| `tests/app-contract.test.mjs` | Contract assertions for no CDN + local fonts |

`lib/composer-fonts.ts` stays as-is (family names / `ensureOverlayFont` already match).

---

### Task 1: Failing contract tests for self-hosted fonts

**Files:**
- Modify: `tests/app-contract.test.mjs`
- Test: `tests/app-contract.test.mjs`

**Interfaces:**
- Consumes: none yet (asserts files/CSS that Task 2–3 will create)
- Produces: failing assertions that drive the remaining tasks

- [ ] **Step 1: Add failing assertions near the existing `globalStyles` / `assetLicenses` checks**

In `tests/app-contract.test.mjs`, after the existing `globalStyles` reads (around the `assert.match(globalStyles, /select option/)` block), add:

```js
  assert.doesNotMatch(globalStyles, /fonts\.googleapis\.com/);
  assert.doesNotMatch(globalStyles, /fonts\.gstatic\.com/);
  assert.match(globalStyles, /overlay-fonts\.css/);

  const overlayFontsCss = await readFile("app/overlay-fonts.css", "utf8");
  for (const family of [
    "Noto Sans TC",
    "Inter",
    "Outfit",
    "Space Mono",
    "Huninn",
  ]) {
    assert.match(overlayFontsCss, new RegExp(`font-family:\\s*['"]${family}['"]`));
  }
  assert.match(overlayFontsCss, /src:\s*url\(["']?\/fonts\/[^)"']+\.woff2/);
  assert.doesNotMatch(overlayFontsCss, /fonts\.googleapis\.com|fonts\.gstatic\.com/);

  const { readdir } = await import("node:fs/promises");
  const fontFiles = await readdir("public/fonts");
  assert.ok(
    fontFiles.some((name) => name.endsWith(".woff2")),
    "expected committed WOFF2 files under public/fonts/",
  );
  assert.ok(
    fontFiles.some((name) => /^OFL-/i.test(name) && name.endsWith(".txt")),
    "expected OFL-*.txt license files under public/fonts/",
  );
```

Also extend the existing `assetLicenses` assertions (near `CC BY-SA 4.0`):

```js
  assert.match(assetLicenses, /SIL Open Font License|Open Font License 1\.1|OFL/);
  assert.match(assetLicenses, /Noto Sans TC/);
  assert.match(assetLicenses, /Inter/);
  assert.match(assetLicenses, /Outfit/);
  assert.match(assetLicenses, /Space Mono/);
  assert.match(assetLicenses, /Huninn/);
```

And assert About copy mentions OFL fonts (after existing `aboutAssetLicense` usage check):

```js
  assert.match(appI18nEn, /aboutAssetLicense:.*OFL|Open Font License|bundled overlay fonts/i);
```

Note: `appI18n` already concatenates en+ja; also read zh-Hant if needed:

```js
  const appI18nZhHant = await readFile("lib/app-i18n/zh-Hant.ts", "utf8");
  assert.match(appI18nEn, /Open Font License|OFL/);
  assert.match(appI18nZhHant, /Open Font License|OFL|開放字型|開源字型/);
  assert.match(appI18nJa, /Open Font License|OFL|オープン/);
```

Keep the existing `fonts` (composer-fonts) family assertions unchanged.

- [ ] **Step 2: Run the contract test and confirm failure**

Run:

```powershell
node --test tests/app-contract.test.mjs
```

Expected: FAIL — missing `app/overlay-fonts.css` and/or still matching `fonts.googleapis.com` in `globals.css`, and/or missing `public/fonts/`.

- [ ] **Step 3: Commit the failing tests**

```powershell
git add tests/app-contract.test.mjs
git commit -m @"
Add failing contract tests for self-hosted overlay fonts.
"@
```

---

### Task 2: Bundle script + download committed fonts

**Files:**
- Create: `scripts/bundle-overlay-fonts.mjs`
- Create: `public/fonts/*.woff2` (generated)
- Create: `public/fonts/OFL-*.txt` (generated)
- Create: `app/overlay-fonts.css` (generated)
- Modify: `package.json` (add script)

**Interfaces:**
- Consumes: Google Fonts CSS API query matching current `globals.css`
- Produces:
  - `app/overlay-fonts.css` with root-absolute `/fonts/*.woff2` `@font-face` rules
  - `public/fonts/*.woff2`
  - `public/fonts/OFL-*.txt`
  - npm script `bundle:overlay-fonts`

- [ ] **Step 1: Add the npm script**

In `package.json` `"scripts"`, add:

```json
"bundle:overlay-fonts": "node scripts/bundle-overlay-fonts.mjs"
```

- [ ] **Step 2: Write `scripts/bundle-overlay-fonts.mjs`**

Create the file with this implementation (adjust only if Google’s CSS shape requires minor parsing tweaks; keep behavior identical):

```js
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const FONTS_DIR = resolve(ROOT, "public", "fonts");
const OUT_CSS = resolve(ROOT, "app", "overlay-fonts.css");

const GOOGLE_CSS =
  "https://fonts.googleapis.com/css2?family=Huninn&family=Inter:wght@400;500;600;700&family=Noto+Sans+TC:wght@400;500;600;700&family=Outfit:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap";

// Chrome UA so the API returns woff2 @font-face rules.
const CSS_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const OFL_SOURCES = [
  {
    id: "noto-sans-tc",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanstc/OFL.txt",
  },
  {
    id: "inter",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/inter/OFL.txt",
  },
  {
    id: "outfit",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/outfit/OFL.txt",
  },
  {
    id: "space-mono",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/spacemono/OFL.txt",
  },
  {
    id: "huninn",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/huninn/OFL.txt",
  },
];

async function fetchText(url, headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`GET ${url} -> ${res.status}`);
  }
  return res.text();
}

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GET ${url} -> ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

function localFontName(remoteUrl) {
  const base = remoteUrl.split("/").pop()?.split("?")[0] || "font.woff2";
  if (base.endsWith(".woff2")) {
    return base;
  }
  const hash = createHash("sha256").update(remoteUrl).digest("hex").slice(0, 12);
  return `${hash}.woff2`;
}

mkdirSync(FONTS_DIR, { recursive: true });

const css = await fetchText(GOOGLE_CSS, { "User-Agent": CSS_UA });
const urls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/g)].map(
  (m) => m[1],
);
if (urls.length === 0) {
  throw new Error("No fonts.gstatic.com URLs found — check User-Agent / CSS API response");
}

const urlToLocal = new Map();
for (const url of urls) {
  if (!urlToLocal.has(url)) {
    urlToLocal.set(url, localFontName(url));
  }
}

let rewritten = css;
for (const [remote, local] of urlToLocal) {
  rewritten = rewritten.split(remote).join(`/fonts/${local}`);
}

rewritten =
  "/* Generated by scripts/bundle-overlay-fonts.mjs — do not edit by hand. */\n" +
  "/* Re-run: npm run bundle:overlay-fonts */\n" +
  rewritten;

writeFileSync(OUT_CSS, rewritten, "utf8");

for (const [remote, local] of urlToLocal) {
  const buf = await fetchBuffer(remote);
  writeFileSync(resolve(FONTS_DIR, local), buf);
  console.log(`wrote public/fonts/${local} (${buf.length} bytes)`);
}

for (const entry of OFL_SOURCES) {
  const text = await fetchText(entry.url);
  const name = `OFL-${entry.id}.txt`;
  writeFileSync(resolve(FONTS_DIR, name), text, "utf8");
  console.log(`wrote public/fonts/${name}`);
}

console.log(`wrote ${OUT_CSS}`);
console.log(`bundled ${urlToLocal.size} WOFF2 files`);
```

- [ ] **Step 3: Run the bundler (network required once)**

Run:

```powershell
npm run bundle:overlay-fonts
```

Expected: creates `app/overlay-fonts.css`, multiple `public/fonts/*.woff2`, and five `public/fonts/OFL-*.txt` files. Noto dominates total size (~4MB). If an OFL URL 404s, check the google/fonts repo path for that family and fix `OFL_SOURCES` only.

- [ ] **Step 4: Spot-check generated CSS**

Confirm `app/overlay-fonts.css`:

- contains `font-family: 'Noto Sans TC'` (or `"Noto Sans TC"`)
- contains `/fonts/` WOFF2 paths
- does **not** contain `fonts.googleapis.com` or `fonts.gstatic.com`

- [ ] **Step 5: Commit script + generated assets**

```powershell
git add package.json scripts/bundle-overlay-fonts.mjs app/overlay-fonts.css public/fonts
git commit -m @"
Add Node bundler and commit self-hosted OFL overlay fonts.
"@
```

---

### Task 3: Wire `globals.css` to local overlay fonts

**Files:**
- Modify: `app/globals.css` (line 1)
- Test: `tests/app-contract.test.mjs`

**Interfaces:**
- Consumes: `app/overlay-fonts.css` from Task 2
- Produces: runtime CSS with no Google Fonts `@import`

- [ ] **Step 1: Replace the Google Fonts import**

Change the first lines of `app/globals.css` from:

```css
@import url("https://fonts.googleapis.com/css2?family=Huninn&family=Inter:wght@400;500;600;700&family=Noto+Sans+TC:wght@400;500;600;700&family=Outfit:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap");
@import "tailwindcss";
```

to:

```css
@import "./overlay-fonts.css";
@import "tailwindcss";
```

Do not change the rest of `globals.css`.

- [ ] **Step 2: Re-run contract tests for the font assertions**

Run:

```powershell
node --test tests/app-contract.test.mjs
```

Expected: Google Fonts / overlay CSS / `public/fonts` assertions PASS. Remaining failures (if any) should be limited to `ASSET-LICENSES.md` / About i18n copy from Task 1 that Task 4 will fix. If the whole test still fails only on those license/i18n asserts, that is acceptable for this task.

If `./overlay-fonts.css` import fails the vinext/CSS pipeline, try `@import "../app/overlay-fonts.css"` only if required — prefer `./overlay-fonts.css` since both files live in `app/`.

- [ ] **Step 3: Commit**

```powershell
git add app/globals.css
git commit -m @"
Load overlay fonts from local CSS instead of Google Fonts.
"@
```

---

### Task 4: License notice + About i18n

**Files:**
- Modify: `ASSET-LICENSES.md`
- Modify: `lib/app-i18n/en.ts` (`aboutAssetLicense`)
- Modify: `lib/app-i18n/zh-Hant.ts` (`aboutAssetLicense`)
- Modify: `lib/app-i18n/ja.ts` (`aboutAssetLicense`)
- Test: `tests/app-contract.test.mjs`

**Interfaces:**
- Consumes: `public/fonts/OFL-*.txt` from Task 2
- Produces: redistributor-facing OFL documentation + About copy

- [ ] **Step 1: Extend `ASSET-LICENSES.md`**

Append (keep the existing Bubbles section intact):

```markdown
## Overlay fonts

DiveFrame bundles the following SIL Open Font License 1.1 (OFL) families for
offline composer overlays (web, PWA, and Android APK):

- Noto Sans TC
- Inter
- Outfit
- Space Mono
- Huninn

Binary files live under `public/fonts/` as unmodified `.woff2` redistributions.
Per-family OFL text is stored as `public/fonts/OFL-*.txt`. See
<https://openfontlicense.org/> for the license terms.

These fonts were acquired via the Google Fonts CSS API for packaging only.
DiveFrame does not load `fonts.googleapis.com` or `fonts.gstatic.com` at
runtime. Device Sans continues to use the device system font stack and is not
an OFL bundle.
```

- [ ] **Step 2: Update `aboutAssetLicense` in all three locales**

English (`lib/app-i18n/en.ts`):

```ts
aboutAssetLicense: "The included Bubbles sample background is copyrighted by the DiveFrame developer and licensed under CC BY-SA 4.0. Bundled overlay fonts (Noto Sans TC, Inter, Outfit, Space Mono, and Huninn) are SIL Open Font License 1.1. See the asset notice for attribution and share-alike / OFL terms.",
```

Traditional Chinese (`lib/app-i18n/zh-Hant.ts`) — keep meaning parallel:

```ts
aboutAssetLicense: "內置的 Bubbles 範例背景版權歸 DiveFrame 開發者所有，並以 CC BY-SA 4.0 授權。內置疊加字型（Noto Sans TC、Inter、Outfit、Space Mono、Huninn）以 SIL Open Font License 1.1（OFL）授權。請參閱素材授權聲明以了解署名、相同方式分享與 OFL 條款。",
```

Japanese (`lib/app-i18n/ja.ts`):

```ts
aboutAssetLicense: "付属のBubblesサンプル背景はDiveFrame開発者の著作物で、CC BY-SA 4.0でライセンスされています。同梱のオーバーレイフォント（Noto Sans TC、Inter、Outfit、Space Mono、Huninn）はSIL Open Font License 1.1（OFL）です。帰属表示・同一条件下での配布およびOFLについては、素材ライセンスの注意事項をご確認ください。",
```

- [ ] **Step 3: Run contract tests — expect full pass for font/license asserts**

```powershell
node --test tests/app-contract.test.mjs
```

Expected: PASS for all new font/license/i18n assertions.

- [ ] **Step 4: Commit**

```powershell
git add ASSET-LICENSES.md lib/app-i18n/en.ts lib/app-i18n/zh-Hant.ts lib/app-i18n/ja.ts
git commit -m @"
Document OFL overlay fonts in asset licenses and About copy.
"@
```

---

### Task 5: Docs, HANDOFF, F-Droid outline

**Files:**
- Modify: `docs/USER-GUIDE.md`
- Modify: `HANDOFF.md`
- Create: `docs/2026-08-04-self-hosted-fonts-session.md`
- Create: `docs/FDROID-PATH.md`
- Modify: `docs/2026-08-04-ui-export-about-session.md` (one-line cross-link only if useful)

**Interfaces:**
- Consumes: completed fonts wiring from Tasks 2–4
- Produces: maintainer/user docs; F-Droid outline with **no** release-process change

- [ ] **Step 1: Update USER-GUIDE storage paragraph**

Replace:

```markdown
DiveFrame does not store the logbook on its server. Map-name and nearby-site
lookups use network services. Public webfonts may also be downloaded by the
browser.
```

with:

```markdown
DiveFrame does not store the logbook on its server. Map-name and nearby-site
lookups use network services. Composer overlay fonts are bundled with the app
for offline use (SIL OFL families listed in `ASSET-LICENSES.md`).
```

Optionally clarify the font menu sentence remains accurate (still lists the same faces).

- [ ] **Step 2: Update HANDOFF current-status bullets**

In the “Shipped on main” / open follow-ups area of `HANDOFF.md`:

- Change the overlay-fonts sentence that says fonts load from Google Fonts / Noto kept remotely into: self-hosted OFL WOFF2 under `public/fonts/`, local `app/overlay-fonts.css`, refresh via `npm run bundle:overlay-fonts`.
- Note classification **APK-affecting**.
- Keep `SYSTEM_OVERLAY_FONT_STACK` note for a possible future default if Noto is dropped.
- Link session note + `docs/FDROID-PATH.md`.

- [ ] **Step 3: Write session note `docs/2026-08-04-self-hosted-fonts-session.md`**

```markdown
# 2026-08-04 self-hosted overlay fonts

## Done

- Replaced Google Fonts `@import` with committed OFL WOFF2 under `public/fonts/`
  and `app/overlay-fonts.css`.
- Maintainer refresh: `npm run bundle:overlay-fonts` (Node only).
- Documented OFL in `ASSET-LICENSES.md` and About `aboutAssetLicense`.
- Kept Noto Sans TC as default; `SYSTEM_OVERLAY_FONT_STACK` unchanged for later.

## Classification

Shared client CSS + `public/` assets — **APK-affecting**. Rebuild/publish APK
from the same commit when this lands on `main` if dogfooding needs offline
compose fonts on Android.

## Manual check

- Web Compose with network blocked / airplane mode: overlay fonts still render.
- APK Compose offline: same families available without Google Fonts requests.

## Follow-up

See `docs/FDROID-PATH.md` (outline only; release process unchanged).
```

- [ ] **Step 4: Write `docs/FDROID-PATH.md` (outline only)**

```markdown
# F-Droid path (outline)

Status: planning notes only. The current public Android build remains the
GitHub `diveframe-debug.apk` debug channel (`docs/WEB-APK-SYNC.md`). Do not
treat this document as an active release checklist until signing work starts.

## Direction

- Prefer F-Droid (or another reproducible free-software channel) over hosting
  a long-lived private keystore for the current debug APK channel.
- Self-hosted OFL overlay fonts are a prerequisite for offline / anti-feature
  hygiene; that work is tracked separately and should already be on `main`
  before packaging changes.

## Signing

- Moving off the Android debug keystore changes the signing identity.
- Tell users to **Export app data** before installing a differently signed
  build; uninstalling the debug APK deletes private WebView IndexedDB.
- Avoid committing any production keystore. Prefer F-Droid’s signing model
  (or documented maintainer key custody) over ad-hoc private debug keys.

## Reproducible / build notes

- Pin Node (`engines` in `package.json`) and the JDK used for Gradle.
- Overlay fonts are vendored under `public/fonts/`; builds must not require
  `fonts.googleapis.com` at compile or runtime.
- Client packaging path: `npm test` → commit → `npm run native:sync` →
  Gradle assemble (see `docs/WEB-APK-SYNC.md`).
- Record ABI targets (today: arm64 debug) and versionCode/versionName policy
  before the first non-debug channel.

## LGPL / libdivecomputer

- Classic Shearwater BLE uses libdivecomputer (LGPL). Any F-Droid or store
  release must ship or link corresponding source and meet LGPL obligations
  (JNI bridge + fetched native sources).
- Keep the existing BLE/LGPL release checklist item from the audit open until
  explicitly completed.

## Distribution UX

- Decide whether `/android` and What’s new CTAs keep using GitHub
  `releases/latest/download/diveframe-debug.apk` or point at an F-Droid /
  release page once a signed channel exists.
- Do not flip the stable download URL until the new channel is ready and
  documented.

## Still open (separate)

- Streamed backup encode/restore (audit item 4)
- Large React module splits
- BLE hardening / failure matrix
```

- [ ] **Step 5: Commit docs**

```powershell
git add docs/USER-GUIDE.md HANDOFF.md docs/2026-08-04-self-hosted-fonts-session.md docs/FDROID-PATH.md
git commit -m @"
Document self-hosted fonts and outline the F-Droid path.
"@
```

---

### Task 6: Full verification

**Files:**
- Verify only (no new product code unless a test failure forces a tiny fix)

- [ ] **Step 1: Run full automated validation**

```powershell
npm test
```

Expected: build + typecheck + all `node --test` suites PASS.

If `npm test` is too heavy mid-debug, at minimum:

```powershell
npm run typecheck
node --test tests/app-contract.test.mjs
```

- [ ] **Step 2: Confirm no Google Fonts references remain in app CSS**

```powershell
Select-String -Path app\globals.css,app\overlay-fonts.css -Pattern "fonts\.googleapis|fonts\.gstatic"
```

Expected: no matches.

- [ ] **Step 3: Confirm fonts are in the native static tree after a native web build (optional if full `native:sync` is slow)**

```powershell
npm run native:web
Get-ChildItem dist-native\fonts -Filter *.woff2 | Measure-Object | Select-Object -ExpandProperty Count
```

Expected: count > 0 (same files copied from `public/fonts` via the static export).

- [ ] **Step 4: Manual smoke (document result in session note if run)**

- Open Compose on web; pick each overlay font once; confirm preview text updates.
- With DevTools offline / network blocked, reload Compose and confirm fonts still work (may need a prior online load for HTTP cache, or hard-reload after fonts are service-cached; APK path is the stronger offline proof).

- [ ] **Step 5: Final commit only if Step 1–3 required doc/test tweaks; otherwise stop**

Do **not** publish a new APK in this plan unless the user explicitly asks. Note in the session/HANDOFF that the change is APK-affecting when they next cut a debug release.

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Commit WOFF2 + Node refresh script (option C) | Task 2 |
| Local `@font-face`, replace Google import | Tasks 2–3 |
| Keep Noto default / system stack note | unchanged `composer-fonts.ts`; HANDOFF Task 5 |
| OFL in `ASSET-LICENSES.md` | Task 4 |
| About i18n | Task 4 |
| Contract tests | Tasks 1, 6 |
| USER-GUIDE / HANDOFF / session docs | Task 5 |
| Offline APK compose fonts via bundled assets | Tasks 2–3 + verify Step 3 |
| F-Droid outline only, no release-process change | Task 5 (`docs/FDROID-PATH.md`) |
| No PowerShell downloads | Task 2 (Node script) |
| No APP_SHELL preload of all WOFF2 | honored (no sw.js change) |
