# Erase all data (Settings)

Status: implemented

Historical implementation note; see
[`docs/PRODUCT-SPEC.md`](../../PRODUCT-SPEC.md) for the current product
specification.

## Goal

Add an **Erase all data** control at the bottom of the Settings screen so the user can wipe all local IndexedDB data before importing an app backup. This is a temporary workflow aid while backup import still merges (and can duplicate) rather than replace.

The original duplicate-dive cause was later addressed with deterministic
canonical IDs. Backup import remains additive, so the full reset is still
useful for a known-clean restore. A second **Erase dive data only** scope was
also implemented so reusable images and preferences can be retained.

## Scope

In scope:

- Danger-zone UI at the bottom of Settings
- Browser `window.confirm` before wiping
- Clear every DiveFrame local store
- Clear only dive-related stores as a separate action
- Reset Settings UI state and show status
- English, Traditional Chinese (Hong Kong), and Japanese copy

Out of scope for this implementation:

- Backup import preview or replace-on-import behavior
- Custom modal dialogs
- Type-to-confirm guards
- Deleting non-IndexedDB data (service worker caches, etc.)

## Placement

Add a new settings card after the existing content (backgrounds / planned settings) and before the status line:

- Eyebrow / title indicating a destructive action (e.g. danger / erase data)
- Short description of what will be removed
- Destructive button: **Erase all data**

## Confirmation

On click:

1. Show `window.confirm` with irreversible-warning copy that lists: dives, photos, backgrounds, logo, site contributions, composer settings, and app preferences.
2. If cancelled, do nothing.
3. If confirmed, run the wipe.

No custom modal system (none exists in the app today).

## Data wipe

Add `clearAllLocalData()` in `lib/indexed-db.ts` that opens a single readwrite transaction across all object stores and clears each:

- `dives`
- `sourceRecords`
- `attachments`
- `siteContributions`
- `composerSettings`
- `composerPresets`
- `backgrounds`
- `brandingAssets`
- `appPreferences`

Coverage matches what full app backup export includes.

`clearLocalDiveData()` clears only `dives`, `sourceRecords`, and
`siteContributions`. Deterministic canonical IDs allow retained attachments and
per-dive composer settings to reconnect after the same logs are imported
again.

## After wipe (Settings UI)

- Set contributions / reviewed sites to empty
- Clear backgrounds list and logo
- Reset default cylinder preset to the app default (`DEFAULT_CYLINDER_PRESET_ID`)
- Refresh status to a success message
- Language: preferences are wiped, so call into the existing i18n path to restore the app default language for a consistent empty state (do not leave stale language state that no longer exists in IndexedDB)

Handle failures with a status error message; keep busy-state consistent with other Settings actions.

## i18n

Add keys in `lib/app-i18n.ts` for:

- Section title / description
- Button label
- Confirm dialog body
- Success and failure status strings

Provide English, Traditional Chinese (Hong Kong), and Japanese strings.

## Success criteria

- User can wipe all local DiveFrame data from Settings with one confirmed action.
- After wipe, Settings shows empty local assets and default preferences.
- Importing a backup afterward onto a wiped device restores without leftover pre-wipe records.
- No change to backup import merge semantics in this change.

## Implemented follow-up

The production UI now presents both deletion scopes at the bottom of Settings,
with equal-width destructive controls and separate confirmation copy. The
current readiness recommendation is to add backup import preview with explicit
merge/replace choices rather than relying on deletion as the normal transfer
workflow.
