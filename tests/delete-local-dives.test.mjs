import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

function exportedFunction(source, name) {
  const start = source.indexOf(`export async function ${name}(`);
  assert.notEqual(start, -1, `missing export async function ${name}`);
  let index = source.indexOf("{", start);
  assert.notEqual(index, -1, `missing body for ${name}`);
  let depth = 0;
  for (; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  throw new Error(`unclosed body for ${name}`);
}

function namedFunction(source, name) {
  const start = source.search(
    new RegExp(`(?:async )?function ${name}\\(`),
  );
  assert.notEqual(start, -1, `missing function ${name}`);
  let index = source.indexOf("{", start);
  assert.notEqual(index, -1, `missing body for ${name}`);
  let depth = 0;
  for (; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  throw new Error(`unclosed body for ${name}`);
}

function firstIndex(source, pattern, label) {
  const match = source.match(pattern);
  assert.ok(match?.index !== undefined, label);
  return match.index;
}

const [storage, app, en, ja, zhHant] = await Promise.all([
  readFile("lib/indexed-db.ts", "utf8"),
  readFile("app/DiveFrameApp.tsx", "utf8"),
  readFile("lib/app-i18n/en.ts", "utf8"),
  readFile("lib/app-i18n/ja.ts", "utf8"),
  readFile("lib/app-i18n/zh-Hant.ts", "utf8"),
]);

test("deleteLocalDives is the shared atomic implementation for one or many dives", () => {
  const batch = exportedFunction(storage, "deleteLocalDives");
  const single = exportedFunction(storage, "deleteLocalDive");

  assert.match(batch, /ids:\s*string\[\]/);
  assert.match(batch, /new Set\(ids\)/);
  assert.match(batch, /if\s*\([^)]*length[^)]*\)\s*\{[\s\S]*throw new Error/);
  assert.ok(
    firstIndex(batch, /new Set\(ids\)/, "dedupe") <
      firstIndex(batch, /database\.transaction/, "transaction"),
    "deduplicate before opening a transaction",
  );
  assert.ok(
    firstIndex(batch, /if\s*\([^)]*length/, "empty-list guard") <
      firstIndex(batch, /database\.transaction/, "transaction"),
    "reject an empty list before opening a transaction",
  );

  assert.match(
    single,
    /deleteLocalDives\(\[\s*id\s*\]\)/,
    "single-dive deletion must stay a thin call through the batch implementation",
  );
  assert.doesNotMatch(
    single,
    /database\.transaction/,
    "deleteLocalDive must not open its own transaction",
  );
});

test("selected-dive deletion validates every dive before mutating dependents in one transaction", () => {
  const batch = exportedFunction(storage, "deleteLocalDives");
  const transactionIndex = firstIndex(
    batch,
    /database\.transaction\(\s*\[[\s\S]*?DIVES_STORE[\s\S]*?SOURCES_STORE[\s\S]*?ATTACHMENTS_STORE[\s\S]*?SITE_CONTRIBUTIONS_STORE[\s\S]*?COMPOSER_SETTINGS_STORE[\s\S]*?RAW_DIVE_RECORDS_STORE[\s\S]*?MERGE_GROUPS_STORE[\s\S]*?\]\s*,\s*"readwrite"/,
    "one read-write transaction must cover the same stores as one-dive deletion, including merge groups",
  );
  const validateIndex = firstIndex(
    batch,
    /divesStore\.get\(/,
    "every requested dive must be loaded inside the transaction",
  );
  const missingIndex = firstIndex(
    batch,
    /!dive/,
    "a missing or stale dive must abort the batch",
  );
  const abortIndex = firstIndex(batch, /transaction\.abort\(\)/, "stale IDs abort");
  const firstDelete = Math.min(
    firstIndex(batch, /divesStore\.delete\(/, "dives delete"),
    firstIndex(batch, /sourcesStore\.delete\(/, "sources delete"),
    firstIndex(batch, /attachmentsStore\.delete\(/, "attachments delete"),
    firstIndex(batch, /rawStore\.delete\(/, "raw delete"),
    firstIndex(batch, /contributionsStore\.delete\(/, "contributions delete"),
    firstIndex(batch, /composerSettingsStore\.delete\(/, "composer delete"),
  );

  assert.ok(transactionIndex < validateIndex, "open the transaction before loading dives");
  assert.ok(validateIndex < missingIndex, "load requested dives before deciding to abort");
  assert.ok(missingIndex < abortIndex, "detect a missing dive before aborting");
  assert.ok(
    abortIndex < firstDelete,
    "abort a stale ID before deleting any dive or dependent record",
  );
  assert.match(batch, /await transactionComplete\(transaction\)/);
  assert.equal(
    batch.match(/notifyLocalDataChanged\("mutation"\)/g)?.length,
    1,
    "one successful batch must emit one local-data-change notification",
  );
});

test("Delete selected confirms the visible count and does not delete hidden IDs", () => {
  const deleteSelected = namedFunction(app, "deleteSelectedDives");
  assert.match(app, /deleteLocalDives,/);
  assert.match(
    deleteSelected,
    /const ids = visibleSelectedDiveIds\(\);/,
    "delete only currently visible selected IDs",
  );
  assert.match(deleteSelected, /await deleteLocalDives\(originalIds\)/);
  assert.doesNotMatch(
    deleteSelected,
    /Array\.from\(selectedDiveIds\)/,
    "do not delete hidden checked IDs",
  );
  assert.match(app, /t\("deleteSelectedDives"\)/);
  assert.match(app, /t\("deleteSelectedDivesTitle", \{ count: visibleSelectedCount \}\)/);
  assert.match(app, /t\("deleteSelectedDivesDescription"\)/);
  assert.match(
    app,
    /disabled=\{busy \|\| !visibleSelectedCount\}[\s\S]*t\("deleteSelectedDives"\)/,
  );
});

test("cancel leaves selection unchanged and failure does not clear it", () => {
  const deleteSelected = namedFunction(app, "deleteSelectedDives");
  const successBranch = deleteSelected.slice(
    firstIndex(deleteSelected, /await deleteLocalDives\(originalIds\)/, "delete call"),
  );
  const failureBranch = deleteSelected.slice(
    firstIndex(deleteSelected, /catch\s*\(/, "failure path"),
  );

  assert.match(successBranch, /setSelectedDiveIds\(new Set\(\)\)/);
  assert.match(successBranch, /setSelectMode\(false\)/);
  assert.doesNotMatch(
    failureBranch.split(/finally/)[0],
    /setSelectedDiveIds/,
    "on failure, preserve the selection so retry is possible",
  );
  assert.match(
    app,
    /setDeleteSelectedConfirmOpen\(false\)[\s\S]*?\{t\("cancel"\)\}/,
  );
  assert.doesNotMatch(
    app.match(
      /onClick=\{\(\) => \{\s*if \(!busy\) setDeleteSelectedConfirmOpen\(false\);/,
    )?.[0] ?? "",
    /deleteSelectedDives/,
  );
});

test("all three locales ship delete-selected labels, confirmation, success, and failure text", () => {
  for (const [locale, source] of [
    ["en", en],
    ["ja", ja],
    ["zh-Hant", zhHant],
  ]) {
    for (const key of [
      "deleteSelectedDives",
      "deleteSelectedDivesTitle",
      "deleteSelectedDivesDescription",
      "deletingSelectedDives",
      "selectedDivesDeleted",
      "selectedDivesDeleteFailed",
    ]) {
      assert.match(source, new RegExp(`${key}:`), `${locale} is missing ${key}`);
    }
  }

  assert.match(en, /deleteSelectedDives:\s*"Delete selected"/);
  assert.match(en, /deleteSelectedDivesTitle:\s*"Delete \{count\} selected dives\?"/);
  assert.match(en, /selectedDivesDeleted:\s*"Deleted \{count\} dives"/);
  assert.match(en, /deleteSelectedDivesDescription:[\s\S]*photos/);
  assert.match(en, /deleteSelectedDivesDescription:[\s\S]*site entries/);
  assert.match(en, /deleteSelectedDivesDescription:[\s\S]*composer settings/);
  assert.match(en, /deleteSelectedDivesDescription:[\s\S]*raw records/);
  assert.match(en, /deleteSelectedDivesDescription:[\s\S]*source links/);
  assert.match(en, /deleteSelectedDivesDescription:[\s\S]*cannot be undone/);
  assert.match(ja, /deleteSelectedDivesTitle:[\s\S]*\{count\}/);
  assert.match(ja, /selectedDivesDeleted:[\s\S]*\{count\}/);
  assert.match(zhHant, /deleteSelectedDivesTitle:[\s\S]*\{count\}/);
  assert.match(zhHant, /selectedDivesDeleted:[\s\S]*\{count\}/);
});
