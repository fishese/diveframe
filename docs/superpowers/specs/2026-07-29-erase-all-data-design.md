# Erase all data (Settings)

## Goal

Add an **Erase all data** control at the bottom of the Settings screen so the user can wipe all local IndexedDB data before importing an app backup. This is a temporary workflow aid while backup import still merges (and can duplicate) rather than replace.

## Scope

In scope:

- Danger-zone UI at the bottom of Settings
- Browser `window.confirm` before wiping
- Clear every DiveFrame local store
- Reset Settings UI state and show status
- EN + zh-Hant copy

Out of scope:

- Fixing backup-import duplication / replace-on-import behavior
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
- `backgrounds`
- `brandingAssets`
- `appPreferences`

Coverage matches what full app backup export includes.

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

Provide English and Traditional Chinese (Hong Kong) strings.

## Success criteria

- User can wipe all local DiveFrame data from Settings with one confirmed action.
- After wipe, Settings shows empty local assets and default preferences.
- Importing a backup afterward onto a wiped device restores without leftover pre-wipe records.
- No change to backup import merge semantics in this change.
