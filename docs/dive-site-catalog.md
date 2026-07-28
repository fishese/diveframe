# Dive-site catalog

DiveFrame uses a catalog-first lookup:

1. Search active catalog entries within 30 km of the dive's GPS entry point.
2. If one or more catalog sites are found, return only those trusted entries.
3. If none are found, query the existing OpenStreetMap suggestion providers.
4. Manual site entry is always available. A manual site needs coordinates
   before it can be exported as a catalog contribution.

The application bundles the catalog as `data/dive-sites.json`. It is loaded by
the stateless nearby-site route and can be replaced through the review workflow
in Settings.

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

Future catalog imports should upsert by `id`. A changed coordinate or preferred
name should update the existing record without changing the id. Retired sites
should remain in the dataset with `status: "retired"` so old dive logs can keep
their historical names.
