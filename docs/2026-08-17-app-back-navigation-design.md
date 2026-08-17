# Hierarchical system-back navigation

Date: 2026-08-17

## Problem

System Back (browser Back, Android gesture/button, PWA standalone Back) currently leaves DiveFrame from most screens.

- Dive list and dive detail are the same `/` route. Opening a dive only sets React `mobileDetail`; it does not push history. Leaving detail uses `history.replaceState` to strip `?dive=`. The window often has a single history entry, so Back exits.
- Settings, map, compose, and other pages are real routes. Next.js `<Link>` uses client `pushState`. Desktop Back can already return to the previous URL, but that is **history back**, not the brand-icon parent. Home → Settings → Map then Back would reopen Settings; the brand icon on Map goes home.
- The APK has no back handler. Capacitor 8 falls through to `WebView.canGoBack()`, which often stays false for client-side Next.js routing, so hardware Back exits from every screen.
- React has not hydrated yet on first paint, during Capacitor WebView load, and on cold starts (including the Preview memos shortcut). Any solution that only registers in `useEffect` will still exit during that gap.

## Goal

System Back follows the same **hierarchical up** path as the brand mark, on both the hosted PWA and the APK, including **before React hydrates**.

Dialogs close first. At the home list with nothing open, Back still leaves the app.

This is shared client plus Android shell behavior. It needs a web deploy and a new APK from the same commit (`docs/WEB-APK-SYNC.md`).

## Non-goals

- Do not add `@capacitor/app`. Use the existing `MainActivity` / `DiveFrameNative` bridge.
- Do not make the house control match catalog-subpage parents. House stays “front of the app” (`/`). Only brand and system Back change for catalog subpages.
- Do not try to wipe the browser history stack. After returning home, intercept leftover same-origin `popstate` so a nested page does not stay on screen; then the following Back may leave the app.
- Do not change in-page controls (composer arrow, house, dialog Cancel).

## Back stack (LIFO)

The top active handler runs first. `true` means consumed; `false` falls through.

1. Open `aria-modal` dialog — close it, stay on the page.
2. Home overlays — import guide or Bluetooth panel closes (same as `goFrontOfApp`: list stays, overlay gone, select mode cleared).
3. Page parent — same destination as the brand mark (table below).
4. Home list, nothing open — do not consume; browser or APK leaves the app.

Dialogs and overlays do not exist before hydration. Unhydrated Back uses only the URL parent map.

## Parent map

Strip a trailing `.html` (native static export) before matching. Keep query/hash handling explicit for compose and dive detail.

| Current location | Brand and Back |
| --- | --- |
| `/compose` (`?dive={id}`) | `/?dive={id}` (dive detail) |
| `/` with `?dive={id}` or hydrated `mobileDetail` | Dive list, scrolled to that dive (`returnToDiveListAtCurrentDive`) |
| `/catalog/supplement`, `/catalog/device-additions` | `/catalog` |
| `/settings`, `/map`, `/about`, `/memos`, `/memo`, `/android`, `/catalog` | `/` |
| `/` with import guide or BLE panel | Close overlay, stay on `/` |
| `/` home list, nothing open | Leave the app |

Compose without `dive` falls back to `/` (same as a missing dive).

Catalog built-in (`source === "built-in"`) brand stays `/`. Supplement and device-additions brand href becomes `/catalog` (one ternary in `CatalogApp`). That is trivial and is in scope.

## Unhydrated behavior (required)

Back must work on the first document, before React, Next.js, or Capacitor JS run.

Follow the existing theme pattern: an inline `<head>` script in `app/layout.tsx` that ships in every HTML page (web and native static export).

The bootstrap must:

1. Install `window.__diveFrameHandleBack()` immediately. It returns a boolean (consumed or not). Android calls this via `evaluateJavascript`.
2. Implement the **URL parent map only** (no dialog/overlay/`mobileDetail` state).
3. If there is a parent, navigate with `location.replace(parentHref)` so the current nested URL is overwritten, then return `true`. (React is not running; do not wait for the Next router.)
4. If the location is home with no `dive` query, return `false`.
5. On nested URLs, push a same-URL dummy history entry and listen for `popstate` so browser/PWA Back is captured before hydration. Re-arm the dummy entry when still nested after handling.
6. Use a replaceable dispatcher (`window.__diveFrameBack.handle`) so React can take over after hydrate without a second `popstate` listener fighting the bootstrap.
7. Treat `/index.html` as `/` (native home). Stripping `.html` from `/index.html` must not become an unknown `/index` route.

Unhydrated limits (accepted):

- No dialog or import/BLE close; those views are not on screen yet.
- Dive detail without `?dive=` cannot be seen from the URL. Opening a dive must `pushState` `/?dive={id}` so a reload or unhydrated Back can see detail.
- Scroll-to-row after leaving detail needs React. Unhydrated Back from `/?dive=` only strips the query and shows the list HTML. Hydrated Back keeps `returnToDiveListAtCurrentDive` scroll.

If Android runs Back before the document exists, `evaluateJavascript` may return `null` / `"pending"`. Java then applies the same parent map to `webView.getUrl()`: nested → `loadUrl(parent)`; home → leave the app. Once the document is there, JS is authoritative.

## Hydrated behavior

`AppBackProvider` in the root layout owns a LIFO stack. `useAppBackHandler(handler, active)` registers while `active` is true (dialogs on open, pages for their parent).

After mount, React replaces `__diveFrameBack.handle` with: run the stack top-down; if a handler returns true, consume; if the stack is empty, run the URL parent map (same function as bootstrap); otherwise return false.

Hydrated page-to-page up uses the Next client router plus `useAppRouteHref` (no full reload). Only the pre-hydrate bootstrap uses `location.replace`.

If the user is already on the home list and `popstate` lands on a leftover same-origin nested URL, replace back to `/` rather than showing that page. The next Back at a true single home entry leaves the app.

`DiveFrameApp` registers:

- each existing confirm/help dialog close;
- import/BLE close;
- `mobileDetail` → `returnToDiveListAtCurrentDive`.

Other route pages register “go to parent href” using `useAppRouteHref` (native `.html` suffix). Composer parent is `/?dive={id}`.

`chooseDive` / equivalent must `history.pushState` (not only React state) to `/?dive={id}` so the URL matches detail. Leaving detail still strips `?dive=` (replaceState) and scrolls the row.

## Native APK

Do not add plugins. After `super.onCreate`, register an `OnBackPressedCallback` so it runs before Capacitor’s default `WebView.goBack()` / finish.

- Call `window.__diveFrameHandleBack()`.
- `"true"` → do nothing else.
- `"false"` → leave the app (same as today: finish / default Capacitor exit).
- `"pending"` / empty / JS exception → Java URL fallback, then exit if still at home.

No `@capacitor/app`. Keep `DiveFrameNative` for safe-area; Back is a one-shot JS evaluation, not a new `@JavascriptInterface` method, unless evaluation proves unreliable (then a `handleBackConsumed(): boolean` bridge is allowed).

## Source of truth

Put the parent map in one TypeScript module (e.g. `lib/app-back.ts`):

- `appBackParent(pathname, search) → string | null` (`null` = leave the app).
- Bootstrap IIFE generated from that table (JSON route list inlined into the script string) so layout does not fork matching rules.
- Native-contract tests list the same path prefixes Java uses for the pre-document fallback.

`appendAppRouteSuffix` applies when writing hrefs from React. The pure parent function should emit suffix-free paths; callers add `.html` when `DIVEFRAME_NATIVE_STATIC` is on. The bootstrap sees the live `location.pathname` (already `.html` in the APK) and must strip `.html` before matching, then add it back when building the parent (`/catalog` → `/catalog.html`, `/` stays `/`).

## Error handling

- Handler throw: treat as not consumed only after the Java/bootstrap fallback has tried URL-up; do not crash the WebView.
- Ignore overlapping Back while a `location.replace` / router navigation is in flight.
- Unknown paths: treat as nested app pages and go home (`/`), not exit. New routes should not silently exit.

## Testing

- Unit tests for `appBackParent`: compose + dive query, `?dive=` home, catalog subpages, `.html` suffixes, `/memo` vs `/memos`, unknown path → `/`, bare `/` → `null`.
- `app-contract`: layout bootstrap defines `__diveFrameHandleBack`; `CatalogApp` brand is `/catalog` when `source` is not `built-in`; `chooseDive` (or equivalent) writes `?dive=`.
- `native-contract`: `MainActivity` evaluates `__diveFrameHandleBack` and has a URL fallback; still no `@capacitor/app` dependency.
- Manual: PWA and APK, including Back during first paint on settings/compose/map and the memos shortcut; dialog close then page up; compose → detail → list row; home list exits.

## Files (expected)

| File | Role |
| --- | --- |
| `lib/app-back.ts` | Parent map, bootstrap script string, types |
| `app/AppBackProvider.tsx` | Stack, `useAppBackHandler`, hydrate takeover |
| `app/layout.tsx` | Inline bootstrap next to theme bootstrap; wrap provider |
| `app/catalog/CatalogApp.tsx` | Brand href `/catalog` for non-built-in sources |
| `app/DiveFrameApp.tsx` | `pushState` on choose dive; register detail/overlay/dialogs |
| `app/compose/ComposerApp.tsx` and other route apps | Register parent handler |
| `android/.../MainActivity.java` | Back callback + JS + URL fallback |
| `tests/app-back.test.mjs`, `app-contract.test.mjs`, `native-contract.test.mjs` | Tests above |
