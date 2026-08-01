# BLE Incremental Persist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist each BLE dive as it is captured so process death or cancel keeps already-received dives, with a summary that includes the date range of newly saved dives.

**Architecture:** Native emits rich `diveCaptured` events (base64 + parsed + device fields). `runBleImportSession` persists each dive without advancing the checkpoint; checkpoint writes only on successful completion.

**Tech Stack:** Capacitor Android plugin, IndexedDB via `persistBleImport`, existing BLE normalizer/persist helpers.

## Global Constraints

- Checkpoint advances only on successful non-cancelled completion.
- Cancel and crash keep already-persisted dives.
- Summary date/time is UI-only; identity remains fingerprint.
- Prefer TDD; extend existing contract/session tests.

---

### Task 1: Summary helper + session incremental API shapes

**Files:**
- Modify: `lib/ble-persist.ts` (or small helper in `lib/ble-import-session.ts`)
- Modify: `lib/ble-import-session.ts`
- Test: `tests/ble-import-session.test.mjs`

**Produces:**
- `summarizeNewDiveDates(dates: Array<string | null>): { earliest: string | null; latest: string | null }`
- Session result fields: `newDiveDates`, keep existing counts; cancelled may have `newCount > 0`

- [ ] **Step 1:** Add failing tests for date-range summary and “checkpoint only when complete”.
- [ ] **Step 2:** Implement helpers / result shape stubs needed for tests.
- [ ] **Step 3:** Green.

### Task 2: Native rich `diveCaptured`

**Files:**
- Modify: `android/.../DiveComputerNative.java`
- Modify: `android/.../DiveComputerDownloadCollector.java`
- Modify: `android/.../DiveComputerSession.java`
- Modify: `android/.../DiveComputerPlugin.java`
- Modify: `android/.../cpp/diveframe_dc.c` (parse in dive path)
- Modify: `lib/dive-computer-capability.ts`
- Test: `tests/native-contract.test.mjs`

- [ ] **Step 1:** Failing contract asserts for `dataBase64` / `parsed` on diveCaptured emit path.
- [ ] **Step 2:** Emit base64 + parsed (+ serial) from collector/plugin; parse per dive before/during notify.
- [ ] **Step 3:** Green contracts; `assembleDebug` compiles.

### Task 3: Session incremental persist + UI summary

**Files:**
- Modify: `lib/ble-import-session.ts`
- Modify: `lib/ble-persist.ts` (single-dive prepare helper if needed)
- Modify: `app/components/BleImportPanel.tsx`
- Modify: `lib/app-i18n.ts`
- Test: `tests/ble-import-session.test.mjs`, `tests/app-contract.test.mjs`

- [ ] **Step 1:** Failing tests: listener persists each dive; end only checkpoints; cancel keeps saves.
- [ ] **Step 2:** Wire listener in session; update i18n/panel summary.
- [ ] **Step 3:** Full `npm test` green.

### Task 4: Docs note

**Files:**
- Modify: `docs/2026-08-01-ble-product-import-session.md` or user guide briefly

- [ ] Note incremental persist + cancel keeps partial + checkpoint rules.
