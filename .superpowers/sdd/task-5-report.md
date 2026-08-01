# Task 5 Report: What's new Settings UI

## Status

Implemented and verified.
Commit: `ee072ec` — Show What is new in Settings with HTTPS download links.

## Summary

- Settings loads the cached What’s new document, refreshes it while online, and persists the refreshed document and fetch time.
- A collapsible card shows unseen-version state, entries, inline HTTPS links, and HTTPS CTA buttons. Opening the card persists the document version as seen.
- Added English, Traditional Chinese, and Japanese copy plus responsive card styles.

## Verification

- `node --test tests/app-contract.test.mjs` — 1 passed.
- `npx tsc --noEmit` — passed.
- `npm test` — 72 passed, 3 skipped, 0 failed.

## Concerns

None blocking. The UI has no browser-level interaction test; the contract test confirms the integration identifiers and full build/type checks passed.

## Review fix (Important)

**Finding:** `app/globals.css` grew ~98 lines with bespoke What's new typography/borders duplicating existing settings patterns.

**Changes:**
- Refactored `SettingsApp.tsx` to reuse `settings-card-heading`, `settings-note`, and `settings-actions` for summary, entry body/date, and download CTAs.
- Slimmed What's new CSS to layout-only rules: card order, collapsible summary, unseen badge, entry list dividers, and one scoped `.settings-note` margin override in the summary.
- Removed duplicate typography, link styling, box-shadow badge flourish, and `.whats-new-links` (replaced by existing `.settings-actions` including mobile full-width buttons).

**CSS delta:** ~−57 lines net in `app/globals.css` vs pre-fix Task 5 styles (~41 lines What's new-specific CSS remain).

**Verification:** `node --test tests/app-contract.test.mjs` — 1 passed.
