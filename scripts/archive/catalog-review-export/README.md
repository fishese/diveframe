# Archived catalog-review exports

The advanced-settings buttons for **Export addition log** and **Download merged
dive-sites.json** were removed from the user interface on 2026-08-03. The
supplementary catalog remains device-local and continues to provide additional
dive-site suggestions.

The removed behavior was intentionally not deleted from repository history. To
restore it, recover `exportAddedSiteLog`, `downloadMergedCatalog`,
`contributionForExport`, and `saveJson` from commit `9ebcc7a`, then restore the
two buttons and merge explanation in `app/settings/SettingsApp.tsx`.

The merge preview and local review controls remain in the app because they may
be useful if the export workflow returns.
