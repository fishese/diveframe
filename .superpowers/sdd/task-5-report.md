# Task 5 Report: Wire dive detail (gated)

## Status

**DONE**

**Branch:** `feature/memo-dive-match`  
**Commit:** `b84edc1` — Show gated nearby-memo hints on dive detail.

## Summary

Wired `MemoDiveMatchHints` into dive detail in `DiveFrameApp.tsx`, gated by `diveNeedsPlaceNameHint(dive)`. Memos load via `listLocalDiveMemos` when the selected dive lacks a place name. The hint block renders above the site picker. `onDiveChange` updates parent `dives` state (same map pattern as other editors) and syncs local site/location/buddy/notes drafts; `onMemosChange` updates DiveDetail-local memo list. Did not modify `MemosApp` (Task 6).

## Deliverables

| File | Action |
| --- | --- |
| `app/DiveFrameApp.tsx` | Modified — gated mount + memo load + callbacks |
| `tests/app-contract.test.mjs` | Modified — asserts import/gate/list + render above site picker |

## Behavior

- Gate: if `!diveNeedsPlaceNameHint(dive)`, render nothing (and clear loaded memos).
- Load: `listLocalDiveMemos()` when detail is open and gate is true (`dive.id` / gate deps).
- Placement: `<MemoDiveMatchHints mode="on-dive" … />` immediately above `.site-picker-card`.
- Refresh: parent `setDives` on apply/copy; local drafts updated from the returned dive.

## Verification

```powershell
node --test tests/app-contract.test.mjs
```

```
✔ ships the DiveFrame import, map, photo, and composer workflow
ℹ pass 1 / fail 0
```

```powershell
npm run typecheck
```

```
> tsc --noEmit --incremental false
(exit 0)
```

Manual browser smoke (dive without site + nearby memo; dive with `userSite` hides block) not run in this session — contract + typecheck only.

## Self-review

- Spec: gated dive detail, load memos, mount above site picker, refresh via onDiveChange/onMemosChange — covered.
- MemosApp untouched.
- Contract test fails correctly before wiring (missing `MemoDiveMatchHints`), passes after.

## Concerns

1. No interactive/browser smoke in this environment; UI behavior relies on Task 4 component + contract placement assertions.
2. Memos reload only when `dive.id` or gate flips — cross-tab memo creates while detail stays open won’t appear until remount/gate cycle (acceptable for v1; parent already refreshes dives via `subscribeLocalDataChanges`).

## Review fix (Important P1)

**Finding:** Dive detail gates `MemoDiveMatchHints` with `diveNeedsPlaceNameHint(dive)`. Apply empty often sets `userSite`/`location` → immediate `onDiveChange` → gate false → component unmounts before Keep/Delete dialog can show.

**Fix (in shared `MemoDiveMatchHints`, no parent hold):**
- Apply empty: after `writeApplyPlan`, defer `onDiveChange`; open post-apply dialog with the updated dive.
- Keep / Delete completion: then call `onDiveChange(updatedDive)` (and `onMemosChange` / `onMemoChange` as before).
- Backdrop dismiss: call `onDiveChange` so UI reflects IDB writes, then close dialog.
- Per-field Copy still calls `onDiveChange` immediately (no dialog).
- Early empty-candidate return skipped while `postApply` is open.

**Verification:** `npm run typecheck` — exit 0.

**Commit:** `Keep memo match hints mounted through post-apply dialog.`
