### Task 6: Collapsible date/computer filters + Reset + search haystack

**Files:**
- Modify: `app/DiveFrameApp.tsx`
- Modify: `app/globals.css`
- Modify: `lib/app-i18n.ts`
- Modify: `tests/app-contract.test.mjs`
- Modify: `tests/dive-list-model.test.mjs` if filter wiring needs extra cases

**Interfaces:**
- Consumes: `diveMatchesListFilters` / `buildDiveListRows` from Task 1

- [ ] **Step 1:** State `dateFrom`, `dateTo`, `computerFilter`, `filtersOpen`. Distinct computers from `dives.map(d => d.computerModel).filter(Boolean)` sorted.

- [ ] **Step 2:** Collapsible panel with date inputs + computer `<select>`. Pipeline: filter with `diveMatchesListFilters` (include search + chips + new fields) → `buildDiveListRows`.

- [ ] **Step 3:** **Reset filters** clears `dateFrom`/`dateTo`/`computerFilter` + named/gps/appSite chips. Does **not** clear search text. Disable/hide emphasis when nothing active (extend existing `filter-clear` or add `resetFilters` control).

- [ ] **Step 4:** Ensure search needle includes `computerModel` (in model helper).

- [ ] **Step 5: Commit**

```bash
git commit -m "Add collapsible date and computer dive list filters."
```

---