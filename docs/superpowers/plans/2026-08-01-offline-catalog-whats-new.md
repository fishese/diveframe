# Offline catalog + What’s new Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist supplementary dive-site catalogs in IndexedDB (web + APK), keep the official catalog build-bundled only, and add a Settings What’s new feed with HTTPS download links — without wiping existing BLE data on schema bump.

**Architecture:** Additive IndexedDB v9 adds a `supplementaryCatalog` store. Nearby resolution always uses `combineDiveSiteCatalogs(bundled, supplementary)`. What’s new is a static JSON document served through a small CORS-aware API route, cached on `appPreferences`, and rendered with structured link CTAs (e.g. APK download).

**Tech Stack:** TypeScript, IndexedDB, vinext/React Settings + DiveFrameApp, Capacitor Android shell, node:test contract/unit tests.

## Global Constraints

- Official catalog = only `data/dive-sites.json` shipped in that web deploy / APK; no remote official overlay.
- Supplementary catalog persists in IndexedDB and **is** included in backups.
- v8 → v9 migration is **additive only** — never delete existing stores/records (protect BLE downloads).
- What’s new supports structured `links` and inline `[label](https://…)` with `http`/`https` only.
- Tapping links opens the system browser/downloader; no silent sideload.
- Spec: `docs/superpowers/specs/2026-08-01-offline-catalog-whats-new-design.md`.

---

## File structure

| File | Responsibility |
|---|---|
| Modify: `lib/store-manifest.ts` | Register `supplementaryCatalog`; erase/backup policy |
| Modify: `lib/indexed-db.ts` | v9 additive upgrade; CRUD for supplementary; preferences fields for What’s new cache |
| Modify: `lib/dive-site-catalog.ts` | Resolve helper; one-shot sessionStorage → IDB migration; deprecate session-only API usage |
| Create: `lib/whats-new.ts` | Types, validate payload, sanitize URLs, parse inline links |
| Create: `public/whats-new.json` | Published feed (initial stub entries) |
| Create: `app/api/whats-new/route.ts` | Serve feed with Capacitor CORS |
| Modify: `app/settings/SettingsApp.tsx` | Persistent supplementary UX; What’s new card |
| Modify: `app/DiveFrameApp.tsx` | Nearby resolve from bundled + IDB supplementary |
| Modify: `lib/app-backup.ts` | Encode/decode supplementary store; optional on old backups |
| Modify: `lib/app-i18n.ts` | EN / zh-Hant / ja strings |
| Modify: `docs/USER-GUIDE.md`, `docs/PRODUCT-SPEC.md` | User-facing wording |
| Create: `tests/whats-new.test.mjs` | Validation + URL sanitization |
| Modify: `tests/dive-site-catalog.test.mjs`, `tests/native-contract.test.mjs` / `tests/app-contract.test.mjs` | Persistence + additive v9 + Settings wiring |

---

### Task 1: Additive v9 schema + supplementary catalog store

**Files:**
- Modify: `lib/store-manifest.ts`
- Modify: `lib/indexed-db.ts`
- Test: `tests/app-contract.test.mjs` (or a focused new `tests/indexed-db-schema.test.mjs` if contract is string-only)

**Interfaces:**
- Produces:
  - `DATABASE_VERSION = 9`
  - `STORE_NAMES.supplementaryCatalog = "supplementaryCatalog"`
  - `LocalSupplementaryCatalog = { id: "default"; label: string; catalog: DiveSiteCatalog; updatedAt: string }`
  - `getLocalSupplementaryCatalog(): Promise<LocalSupplementaryCatalog | null>`
  - `saveLocalSupplementaryCatalog(label: string, catalog: DiveSiteCatalog): Promise<LocalSupplementaryCatalog>`
  - `clearLocalSupplementaryCatalog(): Promise<void>`
- Consumes: existing `DiveSiteCatalog` from `lib/dive-site-catalog.ts`

- [ ] **Step 1: Write the failing contract assertions**

In `tests/app-contract.test.mjs` (or new schema test), assert source text contains:

```js
assert.match(indexedDb, /DATABASE_VERSION = 9/);
assert.match(indexedDb, /previousVersion < 8/);
assert.match(indexedDb, /supplementaryCatalog/);
assert.doesNotMatch(
  indexedDb,
  /previousVersion > 0 && previousVersion < DATABASE_VERSION/,
);
```

Also assert `store-manifest.ts` lists `supplementaryCatalog` with
`eraseAllData: true, eraseDiveDataOnly: false`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/app-contract.test.mjs`

Expected: FAIL on `DATABASE_VERSION = 9` / wipe-branch pattern.

- [ ] **Step 3: Implement manifest + additive upgrade + CRUD**

`lib/store-manifest.ts` — add store and policies; keep it in `BACKUP_STORE_NAMES` via `ALL_STORE_NAMES`.

`lib/indexed-db.ts`:

```ts
export const DATABASE_VERSION = 9;

export type LocalSupplementaryCatalog = {
  id: "default";
  label: string;
  catalog: import("./dive-site-catalog").DiveSiteCatalog;
  updatedAt: string;
};
```

Replace wipe logic:

```ts
operation.onupgradeneeded = (event) => {
  const database = operation.result;
  const previousVersion = event.oldVersion;
  if (previousVersion > 0 && previousVersion < 8) {
    for (const storeName of Array.from(database.objectStoreNames)) {
      database.deleteObjectStore(storeName);
    }
    createV8ObjectStores(database);
  } else if (previousVersion === 0) {
    createV8ObjectStores(database);
  }
  if (previousVersion < 9) {
    createV9ObjectStores(database);
  }
};

function createV9ObjectStores(database: IDBDatabase) {
  if (!database.objectStoreNames.contains(SUPPLEMENTARY_CATALOG_STORE)) {
    database.createObjectStore(SUPPLEMENTARY_CATALOG_STORE, { keyPath: "id" });
  }
}
```

Ensure `createV8ObjectStores` is still called for fresh installs (`previousVersion === 0`) **and** v9 stores are created afterward.

Implement get/save/clear using key `"default"`.

Wire `exportLocalBackupSnapshot` / `importLocalBackupSnapshot` / size estimate to include `supplementaryCatalog` (array of 0–1 records). In `app-backup.ts`, treat missing array on old backups as `[]`.

- [ ] **Step 4: Run tests**

Run: `node --test tests/app-contract.test.mjs`

Expected: PASS for new assertions. Run full `npm test` if time; at least `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add lib/store-manifest.ts lib/indexed-db.ts lib/app-backup.ts tests/app-contract.test.mjs
git commit -m "Add additive IndexedDB v9 supplementary catalog store."
```

---

### Task 2: Resolve helper + sessionStorage one-shot migration

**Files:**
- Modify: `lib/dive-site-catalog.ts`
- Modify: `tests/dive-site-catalog.test.mjs`

**Interfaces:**
- Consumes: Task 1 IDB CRUD (callers will use IDB; this task stays storage-agnostic where possible)
- Produces:
  - `resolveActiveDiveSiteCatalog(bundled, supplementary): DiveSiteCatalog` → `combineDiveSiteCatalogs(bundled, supplementary)`
  - `takeSessionSupplementaryCatalogMigration(): { catalog, label } | null` — reads+clears sessionStorage keys once

- [ ] **Step 1: Write failing tests**

```js
test("resolveActiveDiveSiteCatalog combines bundled with supplementary", () => {
  const combined = catalogTools.resolveActiveDiveSiteCatalog(catalog, additional);
  assert.equal(combined.sites.length, 2);
});

test("takeSessionSupplementaryCatalogMigration copies then clears session keys", () => {
  // mock sessionStorage like existing session tests
  saveSessionDiveSiteCatalog(catalog, "extra.json");
  const once = catalogTools.takeSessionSupplementaryCatalogMigration();
  assert.equal(once.label, "extra.json");
  assert.equal(catalogTools.loadSessionDiveSiteCatalog(), null);
  assert.equal(catalogTools.takeSessionSupplementaryCatalogMigration(), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/dive-site-catalog.test.mjs`

Expected: FAIL — `resolveActiveDiveSiteCatalog` / `takeSessionSupplementaryCatalogMigration` missing.

- [ ] **Step 3: Implement helpers**

```ts
export function resolveActiveDiveSiteCatalog(
  bundled: DiveSiteCatalog,
  supplementary: DiveSiteCatalog | null,
) {
  return combineDiveSiteCatalogs(bundled, supplementary);
}

export function takeSessionSupplementaryCatalogMigration() {
  const existing = loadSessionDiveSiteCatalog();
  if (!existing) return null;
  clearSessionDiveSiteCatalog();
  return existing;
}
```

Keep `saveSessionDiveSiteCatalog` temporarily for tests/migration only; Settings will stop calling it.

- [ ] **Step 4: Run tests — expect PASS**

Run: `node --test tests/dive-site-catalog.test.mjs`

- [ ] **Step 5: Commit**

```bash
git add lib/dive-site-catalog.ts tests/dive-site-catalog.test.mjs
git commit -m "Add catalog resolve helper and session-to-IDB migration hook."
```

---

### Task 3: Wire Settings + DiveFrameApp to persistent supplementary catalog

**Files:**
- Modify: `app/settings/SettingsApp.tsx`
- Modify: `app/DiveFrameApp.tsx`
- Modify: `lib/app-i18n.ts`
- Modify: `tests/app-contract.test.mjs`

**Interfaces:**
- Consumes: Task 1 CRUD; Task 2 resolve + migration
- Produces: Settings choose/remove persist to IDB; dive detail nearby uses resolved catalog offline

- [ ] **Step 1: Write failing contract checks**

```js
assert.match(settings, /saveLocalSupplementaryCatalog|getLocalSupplementaryCatalog/);
assert.doesNotMatch(settings, /saveSessionDiveSiteCatalog/);
assert.match(app, /resolveActiveDiveSiteCatalog|getLocalSupplementaryCatalog/);
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement Settings**

On load:

1. `const migrated = takeSessionSupplementaryCatalogMigration()`
2. If migrated and IDB empty → `saveLocalSupplementaryCatalog(migrated.label, migrated.catalog)`
3. `getLocalSupplementaryCatalog()` → set UI state `catalog = resolveActiveDiveSiteCatalog(BUILT_IN, supp?.catalog ?? null)`, `catalogLabel = supp?.label ?? null`

`chooseCatalog`: validate → `saveLocalSupplementaryCatalog(file.name, validated)` → refresh UI.  
`removeSessionCatalog` → rename to remove supplementary → `clearLocalSupplementaryCatalog()`.

Update strings: official list “ships with this app version”; supplementary “saved on this device and included in backups” (EN / zh-Hant / ja).

- [ ] **Step 4: Implement DiveFrameApp nearby**

Replace ad-hoc bundled+session merge with:

```ts
const supplementary = await getLocalSupplementaryCatalog(); // or sync from parent state loaded once
const localCatalog = resolveActiveDiveSiteCatalog(
  bundledDiveSiteCatalog,
  supplementary?.catalog ?? null,
);
const localSites = nearbySessionCatalogSites(localCatalog, lat, lng);
setNearbySites(localSites);
// then optional API fetch for OSM when localSites.length === 0
```

Prefer loading supplementary once at app start (state) to avoid async in every detail effect. If detail stays self-contained, cache with `useEffect` + state.

When API returns sites and local was empty, merge; if API fails, keep localSites.

- [ ] **Step 5: Run contract + tsc**

Run: `node --test tests/app-contract.test.mjs` and `npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add app/settings/SettingsApp.tsx app/DiveFrameApp.tsx lib/app-i18n.ts tests/app-contract.test.mjs
git commit -m "Persist supplementary dive-site catalog for web and Android."
```

---

### Task 4: What’s new model + API + preferences cache

**Files:**
- Create: `lib/whats-new.ts`
- Create: `public/whats-new.json`
- Create: `app/api/whats-new/route.ts`
- Modify: `lib/indexed-db.ts` (`LocalAppPreferences` fields)
- Create: `tests/whats-new.test.mjs`

**Interfaces:**
- Produces:
  - `WhatsNewDocument`, `WhatsNewEntry`, `WhatsNewLink`
  - `validateWhatsNewDocument(value: unknown): WhatsNewDocument`
  - `sanitizeWhatsNewHref(href: string): string | null` — only `http:`/`https:`
  - `renderWhatsNewBody(body: string): Array<Text | Link parts>` for `[label](url)`
  - Preferences: `whatsNewCache?: WhatsNewDocument | null`, `whatsNewFetchedAt?: string | null`, `lastSeenWhatsNewVersion?: string | null`
  - `GET /api/whats-new` → JSON + CORS

- [ ] **Step 1: Write failing unit tests**

```js
test("accepts document with APK download link", () => {
  const doc = validateWhatsNewDocument({
    version: "2026-08-01",
    updatedAt: "2026-08-01T00:00:00.000Z",
    entries: [{
      id: "apk",
      title: "Android build",
      body: "New BLE GPS fix. See [notes](https://example.com/notes).",
      links: [{ label: "Download Android APK", href: "https://example.com/app-debug.apk" }],
    }],
  });
  assert.equal(doc.entries[0].links[0].label, "Download Android APK");
});

test("rejects javascript: links", () => {
  assert.equal(sanitizeWhatsNewHref("javascript:alert(1)"), null);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `node --test tests/whats-new.test.mjs`

- [ ] **Step 3: Implement `lib/whats-new.ts`, seed JSON, API route**

`public/whats-new.json` initial stub:

```json
{
  "version": "2026-08-01",
  "updatedAt": "2026-08-01T12:00:00.000Z",
  "entries": [
    {
      "id": "2026-08-01-catalog-offline",
      "title": "Offline site catalog",
      "body": "The bundled dive-site catalog works offline. Import a regional supplement in Settings; it is saved on this device and included in backups.",
      "date": "2026-08-01",
      "links": []
    }
  ]
}
```

`app/api/whats-new/route.ts`: read/import the JSON (or fetch from same origin public path), return `jsonWithCors(request, doc)` and `OPTIONS` handler like geocode.

Extend `LocalAppPreferences` + `saveLocalAppPreferences` to accept the three What’s new fields without dropping them.

Add `fetchWhatsNewDocument(): Promise<WhatsNewDocument>` in `lib/whats-new.ts` using `diveFrameApiUrl("/api/whats-new")`.

- [ ] **Step 4: Run unit tests + tsc — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add lib/whats-new.ts public/whats-new.json app/api/whats-new/route.ts lib/indexed-db.ts tests/whats-new.test.mjs
git commit -m "Add What is new document model, feed file, and CORS API."
```

---

### Task 5: What’s new Settings UI with link CTAs

**Files:**
- Modify: `app/settings/SettingsApp.tsx`
- Modify: `lib/app-i18n.ts`
- Modify: `app/globals.css` (minimal styles for entry + link buttons)
- Modify: `tests/app-contract.test.mjs`

**Interfaces:**
- Consumes: Task 4 fetch/validate/sanitize + preferences fields
- Produces: Settings card that lists entries, opens HTTPS links, marks version seen

- [ ] **Step 1: Contract assertions**

```js
assert.match(settings, /fetchWhatsNewDocument|whatsNewCache|lastSeenWhatsNewVersion/);
assert.match(settings, /Download Android APK|links\.map|sanitizeWhatsNewHref/);
```

(Use stable identifiers actually present in code, e.g. `entry.links` and `sanitizeWhatsNewHref`.)

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement UI**

On Settings mount:

1. Load preferences → show `whatsNewCache` if present.
2. If online, `fetchWhatsNewDocument()`, validate, `saveLocalAppPreferences({ whatsNewCache, whatsNewFetchedAt })`.
3. Badge when `cache.version !== lastSeenWhatsNewVersion`.
4. Opening/expanding the card → set `lastSeenWhatsNewVersion = cache.version`.

Render each entry:

- title, optional date, body with inline link components from `renderWhatsNewBody`
- for each `links` item with sanitized href: `<a className="button button-secondary" href={href} target="_blank" rel="noopener noreferrer">{label}</a>`

i18n keys: `whatsNew`, `whatsNewDescription`, `whatsNewOffline`, `whatsNewUpdated`, `whatsNewMarkSeen` (if needed).

- [ ] **Step 4: Run contract + tsc**

- [ ] **Step 5: Commit**

```bash
git add app/settings/SettingsApp.tsx app/globals.css lib/app-i18n.ts tests/app-contract.test.mjs
git commit -m "Show What is new in Settings with HTTPS download links."
```

---

### Task 6: Docs + full verification

**Files:**
- Modify: `docs/USER-GUIDE.md`
- Modify: `docs/PRODUCT-SPEC.md`
- Modify: `docs/2026-08-01-ble-product-import-session.md` (brief pointer)
- Modify: `package.json` test script if new test file not already globbed — add `tests/whats-new.test.mjs` to the `test` script list

- [ ] **Step 1: Update USER-GUIDE**

Replace “current browser tab” / “not in backups” regional catalog wording with persistent IDB + backup. Add a short **What’s new** subsection mentioning APK download links.

- [ ] **Step 2: Update PRODUCT-SPEC** to match.

- [ ] **Step 3: Run full suite**

Run: `npm test`

Expected: all previously passing tests still pass; new whats-new tests pass; 0 failures.

- [ ] **Step 4: Manual smoke checklist (document in commit body or session note)**

1. Web: import supplementary JSON → reload → still present → export backup includes it.
2. Web: Settings What’s new loads; link opens in new tab.
3. APK (after `npm run native:sync` + install): offline nearby from bundled catalog; supplementary survives force-stop; What’s new fetch uses API origin (production or LAN override).

- [ ] **Step 5: Commit**

```bash
git add docs/USER-GUIDE.md docs/PRODUCT-SPEC.md docs/2026-08-01-ble-product-import-session.md package.json
git commit -m "Document persistent supplementary catalog and What is new."
```

---

## Spec coverage check

| Spec requirement | Task |
|---|---|
| Bundled official offline | 3 (nearby), already partially in tree |
| Supplementary IDB + backup | 1, 3 |
| No remote official refresh | Global constraint / non-goal |
| Additive v9, no wipe from v8 | 1 |
| sessionStorage one-shot migration | 2, 3 |
| What’s new JSON + cache | 4, 5 |
| Structured + inline HTTPS links / APK CTA | 4, 5 |
| Docs | 6 |

## Placeholder / consistency check

- Store name `supplementaryCatalog` used consistently.
- Preferences field names `whatsNewCache`, `whatsNewFetchedAt`, `lastSeenWhatsNewVersion` used in Tasks 4–5.
- API path `/api/whats-new` paired with `public/whats-new.json`.
- Wipe branch only for `previousVersion < 8`, never ` < DATABASE_VERSION`.
