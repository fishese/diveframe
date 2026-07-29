# Prompt: Create a regional DiveFrame dive-site catalog

Copy the prompt below into an AI assistant that can research current public
sources. Replace the region placeholder before sending it.

---

I am creating a regional dive-site catalog for DiveFrame, an open-source dive
log companion. Please research real, named dive sites in the region below and
return a valid JSON file using the exact schema shown here.

**Region:** [REPLACE THIS - for example, "Cozumel, Mexico"]

The catalog is used only to present nearby suggestions that a diver confirms
manually. Coordinates may represent a reef, wreck, mooring area, or customary
entry point, but they must be plausible and supported by a reliable public
source. Never invent a site, translation, alias, or coordinate. Omit uncertain
entries instead.

## Required JSON schema

```json
{
  "schemaVersion": 1,
  "sites": [
    {
      "id": "mx-cozumel-palancar-gardens",
      "name": "Palancar Gardens",
      "aliases": [],
      "coordinates": {
        "latitude": 20.31,
        "longitude": -87.03
      },
      "place": {
        "countryCode": "MX",
        "country": "Mexico",
        "region": "Quintana Roo",
        "locality": "Cozumel"
      },
      "source": {
        "kind": "manual",
        "reference": "regional-curation:cozumel:2026-07-29"
      },
      "status": "active",
      "updatedAt": "2026-07-29T00:00:00.000Z"
    }
  ]
}
```

## Rules

- `id` must be unique, lowercase, and hyphenated. Use
  `{ISO country code}-{locality slug}-{site slug}`.
- `name` should be the name most divers and local operators recognize.
- `aliases` must always be an array. Add verified local-script names,
  alternate spellings, or operator names only when they refer to the same site.
- Coordinates must use decimal latitude and longitude.
- `countryCode` must use ISO 3166-1 alpha-2.
- Use the natural state, province, prefecture, atoll, or similar subdivision
  for `region`.
- Use the dive area, bay, island, reef cluster, or nearby community for
  `locality`, consistently grouping related sites.
- Set `source.kind` to `"manual"`.
- Set `source.reference` to
  `regional-curation:<short-region-slug>:<today's YYYY-MM-DD>`.
- Set `status` to `"active"` unless a reliable current source says the site is
  closed. Do not include permanently closed sites unless there is a clear
  reason to retain them.
- Set `updatedAt` to today's date as an ISO 8601 timestamp.
- Do not add `notes` or fields outside this schema.

Prioritize established sites documented by local dive operators, tourism or
marine authorities, recognized dive guides, or high-quality mapping sources.
Cross-check names and coordinates where possible. Cover the region usefully,
but do not pad the list with guesses.

Before responding, verify that:

1. the output parses as JSON;
2. every ID is unique;
3. every coordinate is within valid latitude/longitude ranges;
4. every `aliases` value is an array;
5. every site follows the exact schema; and
6. there are no trailing commas or comments.

Return only the final UTF-8 JSON object, with no Markdown fence or explanation.
