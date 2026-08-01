# Trip, user GPS, site alias display, and dive-list filters

Status: approved for implementation planning  
Date: 2026-08-01  
Surfaces: DiveFrame web app and Android Capacitor APK (shared UI)

## Goal

Productize IndexedDB v8 overlay fields that already exist but lack editors, and
tighten dive-list filtering so mis-imported batches are easy to isolate.

1. Assign dives to **trips** (per-dive and bulk from the list).
2. Edit **user GPS** (manual + photo EXIF) without overwriting computer GPS.
3. Let users display a **catalog alias** (or typed name) as the dive site name.
4. Add collapsible **date range** and **computer** filters with an easy reset.

## Non-goals (this round)

- `exportGpsPreference` UI (field stays at default `"computer"`).
- Settings-wide trip manager.
- Native-only EXIF pipelines beyond what the shared web stack can read.
- Pinned download strip / BLE work.
- Full Subsurface/UDDF generator GPS rewriting.

## Data model (existing; no schema bump)

| Field / store | Use |
|---|---|
| `trips` (`id`, `name`, `updatedAt`) | Trip labels |
| `dive.tripId` | Assignment; indexed |
| `userGpsLat` / `userGpsLng` / `userGpsSource` / `userGpsUpdatedAt` | User pin; source `"manual"` \| `"photo-exif"` |
| `exportGpsPreference` | Unchanged; default `"computer"` |
| `userSite` / `userSiteSource` / `userSiteCatalogId` | Display name; catalog link when applicable |
| `computerModel` | Filter + search haystack |
| `gpsEntry*` | Computer GPS; never overwritten by user flows |

Backup / erase / merge already cover trips and overlay fields. Import must
continue to **preserve** existing `tripId`, `userGps*`, and site overlays on
matched dives.

## Coordinate resolution (map / “has GPS” display)

1. Computer GPS (`gpsEntryLat` / `gpsEntryLng`) if present  
2. Else user GPS (`userGpsLat` / `userGpsLng`)  
3. Else name/location geocode (existing approximate path)

## UX

### Edit dive details

Extend the existing form (web + Android same component tree):

- **Trip:** select existing trip, **None**, or **New trip…**; when a trip is
  selected, allow **rename**. Deleting a trip is allowed only when no dives
  reference it, or after confirm that clears those assignments first.
- **User GPS:** lat/lng inputs + Clear; **Use location from photo…** listing
  this dive’s attached photos that yield EXIF coordinates (JPEG supported;
  HEIC/unavailable → graceful skip + status). Sets `userGpsSource` to
  `"photo-exif"` or `"manual"` accordingly.
- Existing site name / location / buddy / notes / cylinder fields remain.

### Nearby site picker (alias display)

- One primary control per nearby site: **main name** + alias preview in smaller
  type (not separate hit targets).
- Tap main control → save main catalog name as `userSite`, keep
  `userSiteCatalogId`.
- Small chevron / “aliases” expands **that** site’s alias chips only (one
  expanded site at a time). Choosing a chip sets `userSite` to the alias
  string and keeps the catalog id.
- Manual typing in Edit dive details unchanged (`source: "manual"`).

### Dive list — trip presentation

Trips are intended as short consecutive outings (pack gear, dive a few days).
**No hard consecutive-date limit** on assignment — rely on UI grouping and
user habit. Soft validation is out of scope.

List layout (same layer for trip headers and unassigned dives):

```
Sharp Island 2026-08-01          ← unassigned dive (top-level)
Maldives 2026                    ← trip header (top-level, expanded by default)
  Shark Point 2026-07-21         ← member (indented)
  Banana Reef 2026-07-20         ← member (indented)
```

- **Block model:** each trip is one contiguous block. Unassigned dives never
  appear between members of the same trip.
- **Block order:** sort trip blocks and solo dives together using an **anchor**
  derived from the trip’s visible members under the current sort option
  (for date sort: newest member when sorting newest-first, oldest when
  oldest-first; for duration/depth sort: the member that would rank first
  under that comparator).
- **In-trip order:** members are sorted with the **same comparator** as the
  current list sort (date / duration / max depth, ASC or DESC) — not date-only
  when the list is sorted by another field.
- **Expand/collapse:** trips start **expanded**. Collapse is session-only and
  resets to expanded on reload (not persisted).
- Collapsed header shows the trip name (and optionally a dive count); members
  are hidden until expanded again.

### Dive list — Select mode (trips)

- **Select** toggle enables checkboxes; normal tap-to-open is disabled while
  selecting.
- Action bar: **New trip…** / **Add to existing…** / **Remove from trip**.
- Leaving Select mode clears the selection.
- Trip headers are not themselves selectable targets for opening a dive;
  selection applies to dive rows (including indented members).
- Actions apply to the **currently visible** (filtered) selection.

### Dive list — Filters and search vs trips

- Existing chips (Named / GPS / Set in app) stay.
- Collapsible **Filters** panel (collapsed by default):
  - **From / To** inclusive on `diveDate` (empty bound = open-ended)
  - **Computer** dropdown of distinct `computerModel` values in the logbook +
    “Any”
- Add `computerModel` to the existing text-search haystack.
- **Reset filters** clears date From/To, computer dropdown, and the chip
  filters whenever any of those are active. Search keeps its own clear control
  so typed queries are not wiped by Reset.

**Partial matches (approach A):** when search or filters are active, if any
dive in a trip matches, show that trip’s header and **only matching members**
(still indented, still sorted by the current list comparator). Non-matching
siblings are hidden until filters/search clear. Matching unassigned dives stay
top-level. When nothing is filtering, show full trip blocks.

## Implementation approach

Shared web UI only (approach 1 from brainstorming). Ordered delivery inside
one implementation plan:

1. Trip CRUD helpers + list block presentation + Edit dive details assignment +
   list Select mode  
2. User GPS editors + map resolution helper + EXIF from attached JPEG  
3. Alias expand-in-picker  
4. Date/computer filters + Reset + partial-match trip display (A)  
5. i18n (EN / zh-Hant / ja), USER-GUIDE / PRODUCT-SPEC notes, tests  

## Edge cases

- Trip delete: empty only, or confirm clear-all `tripId` then delete.  
- EXIF with no GPS: status only; no write.  
- Unsupported image types: skip gracefully.  
- Alias expand: collapsing when another site expands or after save.  
- Select mode + filters: only visible dives are selectable/actionable.  
- Filtered trip with one matching member: header + that member only.  
- Collapse state must not be written to IndexedDB or preferences.

## Testing

- IndexedDB: create/rename/delete trip; assign/clear `tripId` (single + bulk).  
- List grouping helper: contiguous blocks, anchor ordering, in-trip sort under
  each sort option; partial-match (A) hides non-matching members.  
- User GPS update; resolution helper (computer > user > geocode).  
- Filter predicates: date range, computer model, reset.  
- Site save with alias string + catalog id.  
- App contract / i18n keys for new controls.  
- Manual PC check first (user preference); Android after EXIF/filters feel right.

## Docs to update when implementing

- `docs/USER-GUIDE.md` — trips, user GPS, alias pick, list filters  
- `docs/PRODUCT-SPEC.md` — overlay editors no longer “fields only”  
- `docs/2026-07-30-indexeddb-v8-planning.md` — editors shipped note  
- Session / roadmap leftovers pointing at “trip/GPS editors”
