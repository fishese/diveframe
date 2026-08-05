# 2026-08-05 memo ↔ dive match hints

Approved in chat. Soft hints with progressive time windows; one-tap apply for
empty fields; expand for per-field copy into non-empty dive fields; no persisted
link schema.

## Goals

1. Surface nearby dive memos on dive detail (when the dive still needs a place
   name) and nearby dives on the memos page.
2. Match by wall-clock start time with progressive windows (±6h preferred,
   ±12h / ±24h for timezone skew).
3. Keep collapsed hints short for multi-dive trip days (expect 3–4 candidates).
4. Let the user apply empty fields, or manually copy individual memo fields
   over filled dive fields after expanding a hint.
5. After apply, offer Keep or Delete for the memo; if kept, optionally append a
   short “linked to dive #…” note when trivial.

## Non-goals

- Persisted `linkedDiveId` / dive-side link records.
- Logbook list-row badges.
- Auto-apply on import without confirmation.
- Requiring GPS proximity to match (optional weak ranking only).
- Changing memo storage schema or backup format version.

## Classification

Shared client UI + pure helpers — **APK-affecting** when shipped.

---

## Time model

Memos store local `date` (`YYYY-MM-DD`) plus `hour` / `minute` / `meridiem`.
Dives store computer-local `diveDate` strings (typically `YYYY-MM-DD HH:MM:SS`
without a timezone). Matching compares **wall-clock instants** parsed the same
way as existing dive-date helpers (`replace(" ", "T")` → `Date`), not true UTC
offsets.

Missing memo hour is treated as the memo default (10:00 AM). Missing / empty
minute is `:00` via `normalizeMemoMinute`.

## Windows

| Mode | Half-window | When used |
| --- | --- | --- |
| Preferred | ±6 hours | Default when any candidates exist |
| Wider | ±12 hours | Auto if ±6h is empty; or user expands |
| Widest | ±24 hours | User expands further |

UI rules:

1. Compute candidates at ±6h.
2. If none, immediately show ±12h results (do not leave an empty block that
   requires a click). Offer expand to ±24h.
3. If ±6h has hits, show those only; offer “Show more (±12h)” then (±24h).
4. Sort by absolute time delta ascending. Show **all** candidates in the active
   window (no forced 1:1 unique pairing for display — trips often have several
   dives per day).

Optional ranking boost: if both sides have GPS and they are within ~6 km,
prefer those slightly earlier in the list. GPS is never required to match.

---

## Dive-detail gate

On **dive detail only**, show the memo-hint block if and only if the dive has
**no place name yet**:

```text
hasPlaceName =
  nonEmpty(userSite) OR nonEmpty(site) OR nonEmpty(location)
```

If `hasPlaceName` is true, hide the entire hint block on dive detail even when
time-window memos exist.

GPS-only (computer or user coordinates with no site/location string) still
needs a name → hints remain visible.

On the **memos page**, always list matching dives in the active window
regardless of whether those dives already have a place name.

---

## Collapsed hint row

One short line per candidate, single-line ellipsis when space runs out:

**On dive detail (memo candidate):**  
`5 Aug, 11:00 AM, Blue Corner`  
— memo local date, time, then memo `location` if non-empty (omit trailing
comma/segment when empty).

**On memos page (dive candidate):**  
`5 Aug, 11:00 AM, Blue Corner`  
— dive start from `diveDate`, then `userSite ?? site ?? location` if any.

Each row includes a small **×** that deletes that **memo** after confirm
(“Delete this memo?”). Deleting from dive detail removes the memo store
record; deleting from the memos page is the same store delete (row vanishes).

Tap the summary (not ×) to expand.

---

## Expanded hint

Show memo fields useful for transfer:

- Heading
- Location
- Coordinates (if any)
- Buddies
- Notes

Actions:

1. **Apply empty fields** — write memo values into the dive only where the
   dive field is currently empty (see matrix below). Then show post-apply
   dialog.
2. **Per-field Copy / Use** — push that one memo value into the corresponding
   dive field even when the dive field is already filled (manual replace).
   Does not by itself open the Keep/Delete dialog unless the implementer
   batches it with Apply; prefer immediate write + light status, Keep/Delete
   only after Apply empty fields (or after an explicit “Apply & finish” if
   that stays clearer in UI).

### Apply-empty matrix

| Memo field | Dive target | Empty means |
| --- | --- | --- |
| `location` | `userSite` via manual site path | no `userSite` and no `site` |
| `location` (also) | `location` broad label | `location` null/blank |
| `lat`/`lng` | `userGps*` | no computer GPS pair and no user GPS pair |
| `buddies` | `buddy` | buddy null/blank |
| `notes` | `notes` | notes null/blank |

Never overwrite non-empty values on **Apply empty fields**. Set `appEditedAt`
like other in-app edits. Reuse existing IndexedDB helpers
(`updateLocalDiveSite`, `updateLocalDiveUserGps`, `updateLocalDiveDetails`)
rather than inventing a parallel write path.

Heading is display-only for matching; it is not copied onto the dive unless a
later product decision says otherwise (out of scope).

---

## Post-apply dialog

After a successful **Apply empty fields**:

- Title/body: changes applied.
- **Keep memo** / **Delete this memo?**

**Delete:** `deleteLocalDiveMemo(id)`.

**Keep:** no dive↔memo link record. If trivial, append one line to memo
`notes` (create notes if null):

```text
Linked to dive #N
```

where `N` prefers `sourceDiveNumbers.shearwater`, else
`sourceDiveNumbers.subsurface`, else `diveNumber`, else skip the append and
leave the memo unchanged. Do not invent a fake number from the date alone.

---

## Placement

| Surface | Behavior |
| --- | --- |
| Dive detail | Hint block only when dive lacks place name; lists matching memos |
| `/memos` | Each memo lists matching dives; expand/apply/copy/× as above |
| Logbook list | No badges |

Shared presentational component preferred (e.g.
`app/components/MemoDiveMatchHints.tsx`) fed by pure match helpers.

---

## Library shape (suggested)

- `lib/dive-memos.ts` — add `memoWallClockMs(memo) → number | null` and a short
  summary formatter for collapsed rows.
- `lib/memo-dive-match.ts` — `findMemosNearDive`, `findDivesNearMemo`, window
  helpers, dive `needsPlaceNameHint(dive)`.
- Apply helpers can live beside match or in a thin
  `lib/memo-dive-apply.ts` that returns the patch plan for tests without
  touching IndexedDB.

No IndexedDB version bump.

---

## i18n

Add trilingual strings for: section title, show more (±12h / ±24h), apply empty
fields, per-field copy labels, delete confirm, post-apply keep/delete, linked
note template, empty-state when widened window still has nothing (memos page
only; dive detail simply omits the block when gated or empty).

---

## Testing

Unit tests for:

- Wall-clock conversion and ±6 / ±12 / ±24 filtering
- Auto-widen when ±6 empty
- Dive place-name gate
- Apply-empty matrix (fills empties, skips filled)
- Linked-note number preference / skip when no number

UI smoke: open a dive without a site that has a same-day memo; expand; apply;
keep vs delete.

---

## Out of scope (reminders)

- Formal link store / backup fields
- List badges
- Auto-apply on import
- Android long-press shortcut (still deferred from prior memo work)
