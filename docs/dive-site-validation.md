# Dive-site catalog validation

DiveFrame includes an offline validator for bundled and user-provided
`dive-sites.json` catalogs. It performs structural checks before any
proximity calculation, so malformed input produces a report instead of
causing an application error.

## Checks

| Check | Level |
| --- | --- |
| Supported `schemaVersion` and `sites` array | Error |
| Required fields and compatible field types | Error |
| Finite coordinates in valid latitude/longitude ranges | Error |
| Duplicate site ID | Error |
| Same normalized name within 150 metres | Error |
| Different names within 150 metres | Warning |
| No other catalog site within 250 kilometres | Warning |
| A site unusually far from others with the same country/locality | Warning |

Warnings identify records that merit human review. They do not prevent a
catalog from being used. Geographic validation is relative to the supplied
catalog and cannot prove that a location or name is factually correct.

Name comparison is Unicode-aware and supports Latin, Chinese, Japanese, and
other writing systems. Locality centers use spherical coordinates so catalogs
near the international date line do not produce an arithmetic-longitude
artifact.

## In the app

The Settings catalog importer runs this validator locally before saving a
catalog to device-local IndexedDB. Error-level issues reject the file. Warnings
are reported to the user, but the additional catalog remains usable and is
included in app-data backups.

Nothing is uploaded by the validator.

## Command line

Install the repository dependencies, then run:

```text
npm run validate:sites -- data/dive-sites.json
```

You can replace the path with a contributor's proposed catalog. The command
exits with:

- `0` for a clean result or warnings only
- `1` for validation errors
- `2` for missing arguments or unreadable JSON

Thresholds are exported as `DIVE_SITE_VALIDATION_THRESHOLDS` from
`lib/dive-site-validation.ts`.
