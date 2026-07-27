# Dive-site catalog

DiveFrame uses a catalog-first lookup:

1. Search active catalog entries within 30 km of the dive's GPS entry point.
2. If one or more catalog sites are found, return only those trusted entries.
3. If none are found, query the existing OpenStreetMap suggestion providers.
4. Manual site entry is always available.

The application stores the catalog in the D1 `dive_site_catalog` table. The
portable source format is JSON, illustrated by
`data/dive-sites.example.json`.

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
- `notes`: Optional curator notes; not intended as the dive description.
- `status`: `active`, `review`, or `retired`. Only active entries are suggested.
- `updatedAt`: ISO 8601 timestamp for the latest catalog edit.

## Database mapping

Nested JSON values are flattened into `dive_site_catalog`. Aliases are stored
as `aliases_json`; coordinates have a combined index; and status has a separate
index. The lookup first applies a latitude/longitude bounding box, then an exact
Haversine-distance check and distance sort.

Future catalog imports should upsert by `id`. A changed coordinate or preferred
name should update the existing record without changing the id. Retired sites
should remain in the dataset with `status: "retired"` so old dive logs can keep
their historical names.
