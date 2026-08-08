### Task 6: Contract tests, polish, verification

**Files:**
- Modify: `tests/app-contract.test.mjs`
- Modify: any remaining references to retired templates (`rg` the repo)
- Optional: `docs/PRODUCT-SPEC.md` or `public/whats-new.json` only if this ships in the same release train — otherwise skip (YAGNI for this branch until release)

- [ ] **Step 1: Search and clear retired ids**

```bash
rg "full-width-graph|landscape-dashboard|cinematic-split|lowerPanelY|layout === \"graph\"" -g "!node_modules" -g "!docs/**"
```

Fix remaining code references (docs/spec may still mention them historically — fine).

- [ ] **Step 2: Strengthen app-contract asserts**

Assert `composer-settings` / `templates` contain the four ids and new default keys (`panelEdge`, `chartOffsetX`, etc.), and do **not** contain retired ids in `TEMPLATES`.

- [ ] **Step 3: Full verification**

```bash
npm run typecheck
node --test tests/composer-settings-normalize.test.mjs tests/composer-layout.test.mjs tests/composer-stats.test.mjs tests/chart-series.test.mjs tests/composer-presets.test.mjs tests/composer-output.test.mjs tests/app-contract.test.mjs
```

Expected: all PASS. If time allows: `npm test` (includes build).

- [ ] **Step 4: Commit**

```bash
git add tests/app-contract.test.mjs
git commit -m "Lock composer preset redesign with contract and unit coverage."
```

---
