# Memo ↔ dive match hints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show compact, expandable memo↔dive match hints on dive detail (when the dive lacks a place name) and on `/memos`, with progressive ±6/±12/±24h windows, apply-empty, per-field copy, and post-apply Keep/Delete.

**Architecture:** Pure match/apply helpers in `lib/`; shared hint UI component; wire into dive detail and memos page. No IndexedDB schema bump and no persisted link IDs.

**Tech Stack:** Existing DiveFrame client (`lib/dive-memos.ts`, `lib/indexed-db.ts`, `app/DiveFrameApp.tsx`, `app/memos/MemosApp.tsx`), `node:test`, trilingual `lib/app-i18n/*`.

**Spec:** `docs/superpowers/specs/2026-08-05-memo-dive-match-design.md`

## Global Constraints

- Wall-clock matching only (memo local date/time vs dive `diveDate` strings); no true TZ conversion.
- Prefer ±6h; auto-show ±12h when ±6h empty; user may expand to ±24h.
- Dive-detail hints only when `!(userSite || site || location)` (trimmed non-empty).
- Memos page always lists matching dives in the active window.
- Apply-empty never overwrites non-empty dive fields; per-field Copy may replace.
- No `linkedDiveId` schema; Keep may append `Linked to dive #N` when a stable number exists.
- Classification: **APK-affecting**.

## File structure

| File | Role |
| --- | --- |
| `lib/dive-memos.ts` | `memoWallClockMs`, collapsed summary helpers |
| `lib/memo-dive-match.ts` | Windows, candidate lists, place-name gate |
| `lib/memo-dive-apply.ts` | Empty-field patch plan + linked-note helper |
| `tests/memo-dive-match.test.mjs` | Match + gate + window tests |
| `tests/memo-dive-apply.test.mjs` | Apply-empty + note tests |
| `app/components/MemoDiveMatchHints.tsx` | Collapsed/expanded rows, expand window, ×, Apply |
| `app/DiveFrameApp.tsx` | Dive-detail mount (gated) |
| `app/memos/MemosApp.tsx` | Per-memo dive candidates |
| `app/globals.css` | Compact row / expand styles |
| `lib/app-i18n/{en,zh-Hant,ja}.ts` | New strings |

---

### Task 1: Memo wall-clock + match helpers

**Files:**
- Modify: `lib/dive-memos.ts`
- Create: `lib/memo-dive-match.ts`
- Create: `tests/memo-dive-match.test.mjs`

**Interfaces:**
- Produces:
  - `memoWallClockMs(memo: Pick<DiveMemo,"date"|"hour"|"minute"|"meridiem">): number | null`
  - `diveWallClockMs(diveDate: string | null): number | null`
  - `diveNeedsPlaceNameHint(dive: { userSite: string | null; site: string | null; location: string | null }): boolean`
  - `MEMO_MATCH_WINDOWS_MS = { preferred: 6h, wider: 12h, widest: 24h }` (ms half-windows)
  - `listMemosNearDive(dive, memos, halfWindowMs): Array<{ memo; deltaMs }>`
  - `listDivesNearMemo(memo, dives, halfWindowMs): Array<{ dive; deltaMs }>`
  - `resolveMatchHalfWindowMs(preferredHits: number, expanded: "preferred" | "wider" | "widest"): number`  
    (UI uses this: if preferredHits===0 and expanded==="preferred", effective window is wider)

- [ ] **Step 1: Write the failing tests**

In `tests/memo-dive-match.test.mjs` (transpile/`data:` import pattern used by `tests/dive-memos.test.mjs`):

```js
test("memoWallClockMs builds local wall clock from date and 12h time", () => {
  const ms = memoWallClockMs({
    date: "2026-08-05",
    hour: 11,
    minute: 0,
    meridiem: "AM",
  });
  assert.equal(ms, new Date(2026, 7, 5, 11, 0, 0).getTime());
});

test("diveNeedsPlaceNameHint is false when any place string is set", () => {
  assert.equal(
    diveNeedsPlaceNameHint({ userSite: null, site: null, location: null }),
    true,
  );
  assert.equal(
    diveNeedsPlaceNameHint({ userSite: "Blue", site: null, location: null }),
    false,
  );
  assert.equal(
    diveNeedsPlaceNameHint({ userSite: null, site: "X", location: null }),
    false,
  );
  assert.equal(
    diveNeedsPlaceNameHint({ userSite: null, site: null, location: "Hong Kong" }),
    false,
  );
});

test("listMemosNearDive respects half-window and sorts by |delta|", () => {
  const dive = { diveDate: "2026-08-05 12:00:00" };
  const memos = [
    memoAt("a", "2026-08-05", 11, "AM"), // -1h
    memoAt("b", "2026-08-05", 8, "PM"), // +8h
    memoAt("c", "2026-08-04", 12, "PM"), // -24h
  ];
  const within6 = listMemosNearDive(dive, memos, 6 * 3600_000);
  assert.deepEqual(within6.map((r) => r.memo.id), ["a"]);
  const within12 = listMemosNearDive(dive, memos, 12 * 3600_000);
  assert.deepEqual(within12.map((r) => r.memo.id), ["a", "b"]);
});
```

- [ ] **Step 2: Run tests — expect FAIL** (modules missing)

```powershell
node --test tests/memo-dive-match.test.mjs
```

- [ ] **Step 3: Implement helpers**

`memoWallClockMs`: parse `date`, convert 12h+meridiem to 0–23 hour, use `new Date(y, m-1, d, h, normalizeMemoMinute(minute), 0)`. Invalid date → `null`.

`diveWallClockMs`: same pattern as `lib/dive-matching.ts` `parseDiveDate` (export or duplicate one-liner in match module).

`diveNeedsPlaceNameHint`: trim and treat empty string as absent.

List helpers: skip null clocks; filter `|delta| <= halfWindowMs`; sort ascending `|delta|`.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```powershell
git add lib/dive-memos.ts lib/memo-dive-match.ts tests/memo-dive-match.test.mjs
git commit -m "Add memo wall-clock matching helpers for dive hints."
```

---

### Task 2: Apply-empty patch plan + linked note

**Files:**
- Create: `lib/memo-dive-apply.ts`
- Create: `tests/memo-dive-apply.test.mjs`

**Interfaces:**
- Produces:
  - `type MemoDiveApplyPlan = { setUserSite?: string; setLocation?: string | null; setUserGps?: { lat: number; lng: number }; setBuddy?: string | null; setNotes?: string | null }`
  - `planApplyEmptyMemoFields(memo, dive): MemoDiveApplyPlan`
  - `appendLinkedDiveNote(existingNotes: string | null, diveNumberLabel: string | null): string | null`  
    (`diveNumberLabel` null → return `existingNotes` unchanged; else append `\nLinked to dive #N` / set if empty)
  - `preferredDiveNumberLabel(dive): string | null`  
    shearwater → subsurface → `diveNumber`

- [ ] **Step 1: Failing tests**

```js
test("planApplyEmptyMemoFields fills only empty dive fields", () => {
  const plan = planApplyEmptyMemoFields(
    {
      location: "Blue Corner",
      lat: 7.1,
      lng: 134.2,
      buddies: "Sam",
      notes: "surge",
    },
    {
      userSite: null,
      site: null,
      location: null,
      gpsEntryLat: null,
      gpsEntryLng: null,
      userGpsLat: null,
      userGpsLng: null,
      buddy: "Existing",
      notes: null,
    },
  );
  assert.equal(plan.setUserSite, "Blue Corner");
  assert.equal(plan.setLocation, "Blue Corner");
  assert.deepEqual(plan.setUserGps, { lat: 7.1, lng: 134.2 });
  assert.equal(plan.setBuddy, undefined); // dive buddy already set
  assert.equal(plan.setNotes, "surge");
});

test("preferredDiveNumberLabel prefers shearwater then subsurface", () => {
  assert.equal(
    preferredDiveNumberLabel({
      diveNumber: 9,
      sourceDiveNumbers: { shearwater: 42, subsurface: 7 },
    }),
    "42",
  );
  assert.equal(
    preferredDiveNumberLabel({
      diveNumber: null,
      sourceDiveNumbers: {},
    }),
    null,
  );
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement** `lib/memo-dive-apply.ts` per matrix in the spec. Site empty = no `userSite` and no `site`. GPS empty = no valid computer pair and no valid user pair (reuse validation ideas from `lib/dive-gps.ts`).

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```powershell
git add lib/memo-dive-apply.ts tests/memo-dive-apply.test.mjs
git commit -m "Add memo-to-dive empty-field apply planning helpers."
```

---

### Task 3: i18n strings

**Files:** `lib/app-i18n/en.ts`, `zh-Hant.ts`, `ja.ts`

- [ ] **Step 1: Add keys** (EN source of truth; mirror keys in ZH/JA):

```ts
memoMatchTitle: "Nearby memos",
memoMatchTitleFromMemo: "Nearby dives",
memoMatchShow12h: "Show more (±12 hours)",
memoMatchShow24h: "Show more (±24 hours)",
memoMatchApplyEmpty: "Apply empty fields",
memoMatchCopyLocation: "Use location",
memoMatchCopyGps: "Use coordinates",
memoMatchCopyBuddies: "Use buddies",
memoMatchCopyNotes: "Use notes",
memoMatchDeleteConfirm: "Delete this memo?",
memoMatchAppliedTitle: "Changes applied",
memoMatchKeepMemo: "Keep memo",
memoMatchDeleteMemo: "Delete this memo?",
memoMatchLinkedNote: "Linked to dive #{number}",
memoMatchNoCandidates: "No nearby dives in this time window.",
```

Use concise ZH/JA matching existing About/memo tone.

- [ ] **Step 2: `npm run typecheck`** — expect PASS (all three catalogs share `keyof typeof en`).

- [ ] **Step 3: Commit**

```powershell
git add lib/app-i18n/en.ts lib/app-i18n/zh-Hant.ts lib/app-i18n/ja.ts
git commit -m "Add trilingual strings for memo dive match hints."
```

---

### Task 4: Shared `MemoDiveMatchHints` UI

**Files:**
- Create: `app/components/MemoDiveMatchHints.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: match list helpers, apply plan, i18n, IndexedDB save/delete/update helpers passed as callbacks or imported.
- Props sketch:

```tsx
type MemoDiveMatchHintsProps =
  | {
      mode: "on-dive";
      dive: LocalDive;
      memos: DiveMemo[];
      onMemosChange: (memos: DiveMemo[]) => void;
      onDiveChange: (dive: LocalDive) => void;
    }
  | {
      mode: "on-memo";
      memo: DiveMemo;
      dives: LocalDive[];
      onMemoChange: (memo: DiveMemo) => void;
      onDiveChange: (dive: LocalDive) => void;
    };
```

- [ ] **Step 1: Implement collapsed rows**

- Format: `formatMatchSummaryDateTime(ms)` → e.g. `5 Aug, 11:00 AM` (locale-aware via `toLocaleString` with app language if easy; else fixed EN-style is acceptable for v1 if i18n date formatting is heavy — prefer `Intl` with current app locale from `useAppI18n`).
- Append `, {place}` when place non-empty.
- CSS: one line, `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`; row flex with × button.
- State: `expandedId`, `windowLevel: "preferred" | "wider" | "widest"`.
- Effective window: if `windowLevel==="preferred"` and preferred list empty → use wider automatically (do not render an empty preferred-only state).

- [ ] **Step 2: Expanded panel**

- Show memo fields (even in `on-memo` mode, the memo is the source of copyable text; dive is the target — when `on-memo`, expand shows dive identity + memo fields with copy targeting that dive).
- Buttons: Apply empty fields; per-field Use/Copy.
- Apply empty: `plan = planApplyEmptyMemoFields(...)`; call existing writers:
  - `setUserSite` → `updateLocalDiveSite(id, { name, source: "manual", catalogId: null, latitude: memo.lat, longitude: memo.lng, location: undefined })` or the project’s current manual-site signature — **read `updateLocalDiveSite` before wiring**.
  - `setLocation` → include in `updateLocalDiveDetails` or site helper as appropriate.
  - `setUserGps` → `updateLocalDiveUserGps`.
  - buddy/notes → `updateLocalDiveDetails` (pass through existing buddy/notes when only patching one side).
- Then dialog: Keep / Delete. Keep → maybe `appendLinkedDiveNote` + `saveLocalDiveMemo`. Delete → `deleteLocalDiveMemo`.
- × on collapsed row: confirm with `memoMatchDeleteConfirm` then delete.

- [ ] **Step 3: Styles** in `globals.css` under `.memo-match-*` — compact, no card chrome in the hero sense; light divider; expand panel indented. Match existing dive-detail note density.

- [ ] **Step 4: Commit**

```powershell
git add app/components/MemoDiveMatchHints.tsx app/globals.css
git commit -m "Add shared memo dive match hint UI."
```

---

### Task 5: Wire dive detail (gated)

**Files:** `app/DiveFrameApp.tsx` (dive detail section)

- [ ] **Step 1: Load memos** when detail is open (or reuse a parent-loaded list if already available). If `!diveNeedsPlaceNameHint(dive)`, render nothing.

- [ ] **Step 2: Render `<MemoDiveMatchHints mode="on-dive" ... />` near site/location editors (above or below the site block — prefer **above** the site picker so the hint is visible when the dive still needs a name).

- [ ] **Step 3: Manual smoke on web: dive without site + memo within 1h shows one ellipsis row; dive with `userSite` shows no block.

- [ ] **Step 4: Commit**

```powershell
git add app/DiveFrameApp.tsx
git commit -m "Show gated nearby-memo hints on dive detail."
```

---

### Task 6: Wire memos page

**Files:** `app/memos/MemosApp.tsx`

- [ ] **Step 1: Load local dives** (`listLocalDives` or existing helper) once on mount / focus.

- [ ] **Step 2: Under each memo card/editor, render `<MemoDiveMatchHints mode="on-memo" ... />` so matching dives appear even when those dives already have site names.

- [ ] **Step 3: Smoke: memo lists 2–3 same-day dives as compact rows; expand applies empty fields onto chosen dive.

- [ ] **Step 4: Commit**

```powershell
git add app/memos/MemosApp.tsx
git commit -m "Show nearby-dive hints on the memos page."
```

---

### Task 7: Docs + verification

**Files:** `HANDOFF.md` (brief bullet), optional session note only if you normally write one for APK-affecting UI.

- [ ] **Step 1: Run**

```powershell
npm test
npm run typecheck
```

Expected: all tests pass (aside from existing intentional skips).

- [ ] **Step 2: Update HANDOFF** current-status bullet: memo↔dive match hints (gated dive detail + memos page; ±6/12/24). Mark **APK-affecting**.

- [ ] **Step 3: Commit**

```powershell
git add HANDOFF.md
git commit -m "Document memo dive match hints in handoff."
```

---

## Spec coverage checklist

| Spec item | Task |
| --- | --- |
| Wall-clock ±6/12/24 + auto-widen | 1, 4 |
| Multi candidates, short ellipsis rows | 4 |
| Expand + Apply empty + per-field copy | 2, 4 |
| × delete memo with confirm | 4 |
| Post-apply Keep/Delete + optional linked note | 2, 4 |
| Dive-detail place-name gate | 1, 5 |
| Memos page always shows dives | 6 |
| No schema / list badges | (omitted by design) |
| i18n | 3 |
| Tests | 1, 2, 7 |
