# Dive-site catalog

DiveFrame uses a catalog-first lookup:

1. Search active bundled catalog entries within 6 km of the dive's preferred
   structured GPS point (computer entry, computer exit, then user GPS).
2. If one or more bundled sites are found, return those entries; otherwise
   query the existing OpenStreetMap suggestion providers.
3. On the client, add active entries from any user-loaded supplementary catalog,
   remove exact duplicates, and sort the combined list by proximity.
4. Manual site entry is always available. A manual site needs coordinates
   before it can be exported as a catalog contribution.

The application bundles the catalog as `data/dive-sites.json`. It is loaded by
the stateless nearby-site route. Settings can add or remove a supplementary
catalog without replacing the bundled file.

## Regional supplementary catalogs

Settings accepts another compatible `dive-sites.json`. The file is validated
structurally and checked for geographic anomalies before it is stored in local
IndexedDB. It remains available across reloads and app restarts on that device
and is included in DiveFrame app-data backups. Its active sites are added to
the bundled catalog rather than replacing it. Duplicate IDs and identical
name/coordinate records retain the bundled entry. It is never uploaded to the
server. Choosing **Remove additional catalog** removes only those additional
entries; the bundled catalog and OpenStreetMap behavior remain.

The combined bundled-plus-additional catalog becomes the base for the existing
catalog merge/download tool. This lets a user work with a regional catalog
without requiring the main repository to cover every dive destination.

Settings links to
`public/examples/dive-site-catalog-ai-prompt.md`, a reusable prompt for asking
an AI assistant to research a compatible regional file. AI-generated entries
must be reviewed by a person before use or publication; DiveFrame validates the
shape of the JSON but cannot verify that names or coordinates are true.

Users may share a reviewed regional catalog for possible inclusion in a future
bundled catalog. Sharing is optional; the app has no upload endpoint or contact
workflow.

See `docs/dive-site-validation.md` for the validation rules and command-line
workflow.

## JSON format

- `schemaVersion`: Integer format version. Start at `1`.
- `sites`: Array of site records.
- `id`: Stable, lowercase identifier. Do not derive it from coordinates.
- `name`: Preferred display and logbook name.
- `aliases`: Alternative English, local-language, island, reef, wreck, or
  commonly used operator names.
- `coordinates.latitude` / `coordinates.longitude`: WGS84 decimal degrees.
- `place.countryCode`: ISO 3166-1 alpha-2 code where applicable.
- `place.country`, `place.region`, `place.locality`: Human-readable hierarchy.
- `source.kind`: Provenance category such as `manual`, `government`,
  `dive_operator`, or `community`.
- `source.reference`: Optional URL, document id, or dataset record id.
- `status`: `active`, `review`, or `retired`. Only active entries are suggested.
- `updatedAt`: ISO 8601 timestamp for the latest catalog edit.

The lookup calculates exact Haversine distance and sorts nearby active entries
by proximity.

Repository catalog updates should upsert by `id`. A changed coordinate or
preferred name should update the existing record without changing the id.
Retired sites should remain in the dataset with `status: "retired"` so old
dive logs can keep their historical names.

## Review checklist

- Validate JSON syntax and schema before merging.
- Confirm IDs are unique and stable.
- Check coordinates against at least one reliable public source.
- Check aliases refer to the same physical site rather than nearby sites.
- Use consistent locality and region values.
- Do not include curator notes or unsupported fields.
- Prefer omission over a guessed site or coordinate.
