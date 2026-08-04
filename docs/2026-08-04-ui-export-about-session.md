# 2026-08-04 UI, Subsurface export, license, and About

Session notes for work landed with debug APK **1.0.13** (or later), covering
user-reported UI/export fixes, Bubbles relicensing, and About copy.

## Product / UI

- **Delete dive** sits below the photo gallery again (outside the edit form).
- **Buddy field** suggests names from existing logbook dives; separators include
  `,`, `，`, and `、`; completion applies to the current token only
  (`lib/buddy-names.ts`).
- **Full Subsurface logbook export** uses `divelog` `version="3"` and short hex
  site `uuid`s (avoids Subsurface’s older-version / dive-site warning). Incomplete
  dives are still skipped with inline status under Source log tools.

## Licensing

- Bubbles sample background is **CC BY-SA 4.0**, copyright DiveFrame developer
  (`ASSET-LICENSES.md`, LICENSE, README, About/i18n, guides).
- Overlay fonts: superseded by self-hosted OFL — see
  `docs/2026-08-04-self-hosted-fonts-session.md`.

## About

- Intro no longer says DiveFrame does not replace other logbook apps (and does
  not claim that it does).
- Exports mention full Subsurface logbook as well as updating an existing file.
- Source-sync section framed as optional.
- New light “why this exists” note from the developer; contact uses
  **click-to-reveal / copy** email (assembled in JS; not Cloudflare email
  obfuscation).

## Design spec

`docs/superpowers/specs/2026-08-04-delete-buddy-ssrf-license-design.md`

## Classification

Shared client UI/export/i18n — **APK-affecting**.
