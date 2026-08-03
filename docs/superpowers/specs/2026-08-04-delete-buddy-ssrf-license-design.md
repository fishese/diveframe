# 2026-08-04 delete button, buddy autocomplete, SSRF v3, Bubbles CC BY-SA

Approved in chat (attribution: DiveFrame developer).

## Delete dive

Show Delete dive below the photo gallery / share-image actions on the dive
detail page. Remove it from the edit-details form actions. Keep the confirm
dialog.

## Buddy autocomplete

- Split buddy strings on `,`, `，`, and `、`.
- Suggest unique names from other logbook dives for the current token only.
- Selecting a suggestion completes that token and preserves earlier names +
  separators.
- Do not use whole-field `datalist` replacement.

## Subsurface full logbook export

- Emit `divelog` `version="3"` (was `"1"`; causes Subsurface’s older-version
  dive-site warning).
- Use short hex site `uuid` values linked via `divesiteid`.
- Do not import private data from the user’s sample `.ssrf`.

## Bubbles license

Re-license `public/backgrounds/bubbles-bg.jpg` as CC BY-SA 4.0, copyright
DiveFrame developer. Update `ASSET-LICENSES.md`, `LICENSE`, README, and
About/i18n notices.

## About (follow-up)

- Soften intro: do not claim non-replacement or replacement of other logbooks.
- Mention full Subsurface export; keep optional source-checklist workflow.
- Add a short personal “why this exists” section and click-to-reveal contact
  email (`diveframe@fishese.cc` assembled in JS).

## Fonts (deferred)

Keep Noto Sans TC for now. Record `SYSTEM_OVERLAY_FONT_STACK` for a possible
future system-font default. Do not commit an unfinished self-hosted font bundle.
