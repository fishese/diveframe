# Offline site catalog + What’s new — design

Status: approved for planning  
Date: 2026-08-01

## Goal

- Official dive-site catalog works **fully offline** on web and Android from the
  build’s bundled `data/dive-sites.json`.
- Supplementary (user-imported) catalog persists across restarts on **web and
  APK**, and is included in app-data backups.
- Users learn about new releases via a **What’s new** panel that refreshes when
  online — without treating that feed as a second official catalog.
- IndexedDB upgrade must be **additive**: no erase-reimport; existing BLE
  downloads and backups remain intact.

## Non-goals

- Remote “refresh official catalog” button or silent download that overrides the
  APK/web bundled official catalog (avoids two competing official DBs).
- Auto-updating the APK’s official catalog without shipping a new APK.
- Changing OSM nearby fallback semantics beyond preferring local catalog first.
- Multi-supplementary catalogs or cloud sync of catalogs.

## Decisions (locked)

| Topic | Choice |
|---|---|
| Official catalog source | Only the catalog shipped in that web deploy / APK build |
| Web catalog freshness | New worker/site deploy ships a new bundle; PWA picks it up when the service worker updates and the shell reloads — not a separate catalog API |
| APK catalog freshness | New APK only |
| Supplementary storage | IndexedDB (persistent), not `sessionStorage` |
| Backup | Supplementary catalog **yes**; official catalog **no** (always from the running build) |
| Schema bump | v8 → v9 **additive** only (create stores; never delete existing stores/records) |

## Architecture

### Official catalog

- Keep importing `data/dive-sites.json` into the client (and server nearby-sites
  route for OSM/catalog API when used).
- Nearby suggestions always consult this bundled official set first, combined
  with any supplementary overlay.
- No IndexedDB cache of “downloaded official” catalog.

### Supplementary catalog

Single IndexedDB store, e.g. `supplementaryCatalog`, with one record:

```ts
{
  id: "default";
  label: string;          // original filename or user-facing label
  catalog: DiveSiteCatalog;
  updatedAt: string;      // ISO
}
```

- Settings **Choose catalog** validates via existing
  `validateDiveSitesFile` / `validateDiveSiteCatalog`, then writes this record.
- **Remove** deletes the record.
- Resolve: `combineDiveSiteCatalogs(bundledOfficial, supplementary?.catalog ?? null)`.
- Migrate away from `sessionStorage` keys
  (`diveframe-session-dive-site-catalog*`). On first load after upgrade, if IDB
  is empty and sessionStorage still has a catalog, copy once into IDB then clear
  session keys (best-effort; web tabs only).

### Nearby resolution

1. Load bundled official + supplementary from IDB.
2. Rank active sites within 30 km (existing helpers).
3. Optionally fetch `/api/nearby-sites` when online for OSM fill-in **only when
   the combined local catalog returns zero sites within 30 km** — matching the
   server route’s catalog-first behavior. Network failure must not clear local
   suggestions.

### What’s new

- Published static document on the deployed site, e.g. `public/whats-new.json`:

```ts
{
  version: string;       // monotonic id, e.g. "2026-08-01" or build tag
  updatedAt: string;
  entries: Array<{
    id: string;
    title: string;
    body: string;        // plain text supporting inline links (see below)
    date?: string;
    links?: Array<{
      label: string;     // e.g. "Download Android APK"
      href: string;      // https URL to APK, release notes, etc.
    }>;
  }>;
}
```

- **Links are first-class:** each entry may list zero or more `links` rendered
  as tappable actions (not merely plain text). Typical use: point at a new
  Android APK (or release page) so the user can download and install without
  hunting for the file.
- `body` may also contain markdown-style `[label](https://…)` links; the UI
  renders them as anchors. Prefer the structured `links` array for primary
  CTAs (APK download) so the app can style them as buttons.
- Only `http:` / `https:` URLs are opened; other schemes are ignored.
- On Android, tapping an APK or HTTPS link uses the system browser / downloader
  (`window.open` or an intent via Capacitor Browser if already in the project);
  DiveFrame does not side-load silently.
- Settings shows a **What’s new** card (same place users already look for
  catalog and storage notes).
- When online, fetch via `diveFrameApiUrl("/whats-new.json")` (same origin on
  web; production origin on Capacitor). Production must send Capacitor CORS for
  this static file the same way as `/api/*` (or serve it through a small CORS
  route if static assets omit ACAO).
- Cache last successful payload on `appPreferences` (or a tiny dedicated
  preferences-adjacent record) so offline reads still work and erase/backup
  follow preferences policy. Cached entries keep their links for offline
  display; opening a link still needs network unless the file is already on
  the device.
- Track `lastSeenWhatsNewVersion` in preferences; badge/highlight when fetched
  `version` is newer until the user opens the card.
- **Does not** mutate dive-site catalogs.

## IndexedDB v9 migration

Current v8 `onupgradeneeded` deletes all stores when `oldVersion < DATABASE_VERSION`.
That path must **not** run for 8 → 9.

Required change:

```text
if (oldVersion > 0 && oldVersion < 8) {
  // historical clean reset into v8 (unchanged)
  delete all stores; createV8ObjectStores();
}
if (oldVersion < 9) {
  // additive only
  createSupplementaryCatalogStoreIfMissing();
  // What’s new cache + lastSeen live on appPreferences (already exists in v8)
}
```

Never call the wipe branch for upgrades from 8.

### Backup / erase

| Store / data | In backup? | Erase all? | Erase dive-data only? |
|---|---|---|---|
| Supplementary catalog | Yes | Yes | No |
| What’s new cache + lastSeen (via `appPreferences`) | Yes (with preferences) | Yes | No |
| Bundled official | N/A (not stored) | N/A | N/A |

Old backups without `supplementaryCatalog` restore cleanly (treat as empty).

## Settings UX

**Dive-site catalog card**

- Show bundled site count and note that the official list ships with this app
  version.
- Supplementary: choose / remove; show label when present.
- Keep review-merge / export addition log / download merged catalog.
- Update i18n: remove “current tab only” and “not in backups” for supplementary.

**What’s new card** (Settings)

- List cached entries with titles, body (including inline links), and CTA
  buttons from `links` (e.g. **Download Android APK**).
- Status line for last refresh / offline.
- Opening the card marks the current version as seen.

## Testing

- Unit: combine official + supplementary; migration does not delete dive stores.
- Contract: Settings no longer depends on sessionStorage for supplementary;
  backup snapshot includes supplementary; v9 upgrade is additive.
- Manual: APK offline nearby suggestions from bundled catalog; import
  supplementary, kill app, reopen — still present; export/restore backup keeps
  supplementary; What’s new fetch + offline cache.

## Docs to update (implementation)

- `USER-GUIDE.md` — regional catalog persistence + What’s new.
- `PRODUCT-SPEC.md` — catalog / backup wording.
- Session notes if relevant.

## Open points resolved during brainstorming

- No Settings “Refresh official catalog.”
- No dual official DB on the APK.
- Web freshness = deploy new site assets, not a catalog sync channel.
- BLE / existing backups protected by additive v9 migration.
- What’s new supports structured HTTPS links (and inline markdown links) so a
  new APK can be linked for download/install.
