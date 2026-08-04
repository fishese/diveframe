# Session: chrome safe-area + dive memos polish (2026-08-05)

## Branch

`main`

## Classification

**APK-affecting.** Shared web CSS/layout plus Android `MainActivity` inset
injection; rebuild and publish the debug APK from the same commit.

## Delivered

### Dive memos UI

- Time controls stay on one compact row: `< [hour] > : [minute] [AM/PM]`.
- Focus selects hour/minute text for immediate overwrite; minute box ~2ch
  wider with centered digits (number spinners hidden).
- Coordinates input shares one row with GPS / Photo / Clear.
- Hero heading restored: **Jot a memo** (`diveMemosTitle`).
- Debounced IndexedDB saves (earlier in this dogfood pass) kept.

### Chrome / status bar

- What's New / beta banner is **not sticky**; it scrolls away.
- Opaque sticky `.app-safe-top` owns the status-bar inset so content starts
  below system UI without double-padding the DiveFrame topbar.
- Sticky `.topbar` / `.composer-topbar` park at
  `top: var(--safe-area-inset-top, env(...))`.
- Android edge-to-edge: transparent system bars; `MainActivity` injects real
  window insets into `--safe-area-inset-*` because Capacitor WebView often
  reports `env(safe-area-inset-*)` as `0`.

## Deferred

- Trilingual polish of new/changed memo and chrome-adjacent copy (user will
  edit `lib/app-i18n/{en,ja,zh-Hant}.ts` separately).
- Memo ↔ dive auto-match UI.
- Android long-press shortcut to `/memos`.

## Dogfood / release

- APK **1.0.16** (`versionCode 17`), GitHub tag **`v0.1.0-debug.14`**, asset
  `diveframe-debug.apk`, commit `2c4edc1`.
- SHA-256:
  `4F7616053D36B1DB7EF0C8C711FC6AFE3B76C839DF7119131B117CE42EA32F63`.
- https://github.com/fishese/diveframe/releases/latest/download/diveframe-debug.apk
