# DiveFrame handoff

## Product summary

DiveFrame is a private, mobile-friendly dive log viewer for Shearwater and
Subsurface exports. It merges matching records from both sources, displays
maps and nearby dive-site suggestions, stores dive photos, and creates
share-ready image cards.

The current product is deliberately device-local:

- Dive records and import-source mappings are stored in IndexedDB.
- Original photo blobs and photo metadata are stored in IndexedDB.
- Nothing in an imported database or SSRF file is persisted on the server.
- Map search and nearby-site endpoints are stateless network helpers.
- There is no cross-device synchronization yet.

Current private deployment:
https://diveframe-logbook.fishese.chatgpt.site

## Repository map

- `app/DiveFrameApp.tsx` — main UI, file parsers, maps, gallery, and share cards.
- `lib/indexed-db.ts` — device-local persistence and import merge logic.
- `app/api/geocode/route.ts` — stateless OpenStreetMap/Nominatim lookup proxy.
- `app/api/nearby-sites/route.ts` — local catalog and OpenStreetMap fallback.
- `app/globals.css` — responsive application styling.
- `public/manifest.webmanifest` and `public/sw.js` — installable-web-app shell.
- `tests/` — product contract and optional real Shearwater fixture test.
- `.openai/hosting.json` — current private Sites project reference; D1 and R2
  are intentionally disabled.

The old D1/R2 persistence routes and migrations were removed in commit
`67ecfec`. Earlier commits retain that implementation if it is ever needed.

## Local development

Requirements:

- Node.js 22.13 or newer
- npm

Run:

```bash
npm install
npm run dev
```

Then open the local URL printed by the development server.

Validation:

```bash
npm run lint
npm test
```

To run the real Shearwater database test:

```powershell
$env:SHEARWATER_DB_FIXTURE="D:\path\to\Shearwater export.db"
node --test tests/import-shearwater.test.mjs
```

Personal `.db`, `.sqlite`, and `.ssrf` exports are ignored by Git. Do not add
real dive exports, photos, or generated share cards to the repository.

## IndexedDB design

Database: `diveframe-local`

Version: `1`

Object stores:

| Store | Key | Purpose |
| --- | --- | --- |
| `dives` | `id` | Canonical merged dive records and user-selected site names |
| `sourceRecords` | `key` | Maps a source record to its canonical dive ID |
| `attachments` | `id` | Photo metadata and the original image `Blob` |

`attachments` and `sourceRecords` each have a `diveId` index.

The app requests persistent browser storage when available. This reduces
eviction risk but does not replace a backup.

### Import matching

Source identity is stored separately from the canonical dive ID:

- Shearwater source ID: Shearwater `DiveId`
- Subsurface source ID: `deviceid:diveid`

Matching order:

1. Reuse an existing source mapping.
2. Reuse the canonical Shearwater ID when present.
3. Match records by start time, normalized computer serial, and maximum depth.
4. Create a new canonical record when no safe match exists.

The start-time window is five minutes. Same-serial matches tolerate up to
three metres of maximum-depth variance. Matches without a shared serial use a
stricter 90-second and one-metre threshold.

Merge rules:

- Non-empty Shearwater computer fields take precedence.
- Existing location, site, buddy, notes, and GPS values are never erased by an
  empty re-import.
- Subsurface can fill GPS and other fields missing from Shearwater.
- User-selected site names and photos survive all re-imports.

The supplied full test data produced 168 cross-source matches and 19
Subsurface-only records. Perdix dives 17, 18, and 19 received their Subsurface
GPS coordinates without becoming duplicates.

## Browser-storage boundaries

IndexedDB is scoped to the exact web origin and browser profile:

- Production and `localhost` have separate data.
- Different browsers on one device have separate data.
- A future GitHub or custom-domain URL starts with an empty database.
- Clearing site data removes the log and photos.
- Private/incognito storage may disappear when the session closes.
- Large photo collections remain subject to device storage limits.

Changing domains therefore requires an explicit export/import or sync feature;
copying the repository does not copy user data.

## Current hosting

The project currently uses the bundled Vinext/Cloudflare-compatible build and
the private Sites deployment referenced in `.openai/hosting.json`.

The data layer no longer needs D1 or R2. Two stateless server routes remain for
OpenStreetMap lookups. If the project moves to Cloudflare Workers, those routes
can be deployed unchanged with the rest of the app.

For a fully static GitHub Pages deployment, move the geocoding and nearby-site
requests into the browser and configure a static Next/Vite export. Verify the
public OpenStreetMap services' browser CORS and usage-policy requirements
before doing so.

## Recommended next milestone: portable backup

Before attempting live synchronization, add one encrypted, versioned backup
format that works between phone and PC.

Suggested archive:

```text
diveframe-backup.zip
├── manifest.json
├── dives.json
├── source-records.json
└── photos/
    └── <attachment-id>.<extension>
```

Recommended behavior:

1. Export all three IndexedDB stores and image blobs.
2. Include a format version, creation timestamp, and checksums.
3. Encrypt the archive client-side with a user passphrase.
4. On import, merge dives using the existing source mapping and matching rules.
5. Deduplicate photos by content hash rather than filename.
6. Preview additions and conflicts before writing anything.

Once backup/restore is reliable, synchronization can use the same manifest and
merge semantics over a user-selected provider such as a local folder, WebDAV,
Google Drive, iCloud Drive, or a small private API.

## Known follow-ups

- Add backup export/import before users build large photo libraries.
- Add photo deletion, captions, and storage-usage reporting.
- Show whether persistent browser storage was granted.
- Add an IndexedDB integration test using a browser test runner.
- Consider image downscaling or optional originals for large phone photos.
- Decide whether the final deployment is Cloudflare Workers or fully static.

## Recovery and rollback

The previous server-backed release is commit `23dff96`. The first
device-local release is commit `67ecfec`.

The former D1 database and R2 bucket were not deleted during the migration.
Rolling the application back can restore access to their existing records.
