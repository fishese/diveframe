import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

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
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unclosed body for ${name}`);
}

function namedFunction(source, name) {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.notEqual(start, -1, `missing function ${name}`);
  let index = source.indexOf("{", start);
  assert.notEqual(index, -1, `missing body for ${name}`);
  let depth = 0;
  for (; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unclosed body for ${name}`);
}

const javascript = ts.transpileModule(
  await readFile("lib/store-manifest.ts", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const manifest = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
);

const [storage, backup, validation, app, en, ja, zhHant] = await Promise.all([
  readFile("lib/indexed-db.ts", "utf8"),
  readFile("lib/app-backup.ts", "utf8"),
  readFile("lib/backup-record-validation.ts", "utf8"),
  readFile("app/DiveFrameApp.tsx", "utf8"),
  readFile("lib/app-i18n/en.ts", "utf8"),
  readFile("lib/app-i18n/ja.ts", "utf8"),
  readFile("lib/app-i18n/zh-Hant.ts", "utf8"),
]);

test("merge groups are dive data in the store manifest", () => {
  assert.ok(manifest.ALL_STORE_NAMES.includes("diveMergeGroups"));
  const diveOnly = manifest.storeNamesForErase("dive-data-only");
  assert.ok(diveOnly.includes("diveMergeGroups"));
  assert.ok(!manifest.storeNamesForErase("dive-data-only").includes("attachments"));
  assert.equal(
    manifest.STORE_MANIFEST.diveMergeGroups.eraseAllData,
    true,
  );
});

test("schema and backup versions include merge groups additively", () => {
  assert.match(storage, /DATABASE_VERSION = 12/);
  assert.match(storage, /createV12ObjectStores/);
  assert.match(storage, /previousVersion < 12/);
  assert.match(storage, /diveMergeGroups/);
  assert.match(backup, /BACKUP_VERSION = 5/);
  assert.match(backup, /SUPPORTED_BACKUP_VERSIONS = \[1, 2, 3, 4, 5\]/);
  assert.match(backup, /diveMergeGroups/);
  assert.match(validation, /isValidBackupDiveMergeGroup/);
});

test("create and unmerge APIs keep originals and never retarget sources", () => {
  const create = exportedFunction(storage, "createLocalDiveMergeGroup");
  const unmerge = exportedFunction(storage, "unmergeLocalDiveGroup");
  assert.match(create, /evaluateSegmentMerge/);
  assert.match(create, /captureMemberRevision/);
  assert.doesNotMatch(create, /divesStore\.delete/);
  assert.doesNotMatch(create, /sourcesStore\.put/);
  assert.doesNotMatch(create, /rawStore\.put/);
  assert.doesNotMatch(create, /attachmentsStore\.put/);
  assert.match(unmerge, /unmergeLocalDiveGroups\(\[groupId\]\)/);
  assert.doesNotMatch(unmerge, /divesStore\.delete/);
  const batchUnmerge = exportedFunction(storage, "unmergeLocalDiveGroups");
  assert.match(batchUnmerge, /MERGE_GROUPS_STORE|diveMergeGroups/);
  assert.match(batchUnmerge, /uniqueIds\.forEach\(\(id\) => store\.delete\(id\)\)/);
  assert.match(create, /existing\?\.memberDiveIds/);
});

test("rekey, delete, and duplicate merge keep group membership consistent", () => {
  const rekey = namedFunction(storage, "rekeyDive");
  const del = exportedFunction(storage, "deleteLocalDives");
  const duplicate = exportedFunction(storage, "mergeLocalDuplicateDives");
  assert.match(rekey, /memberDiveIds/);
  assert.match(del, /diveMergeGroups|MERGE_GROUPS_STORE/);
  assert.match(duplicate, /memberDiveIds/);
  assert.match(duplicate, /throw new Error/);
});

test("logbook merge action does not call destructive duplicate merge", () => {
  assert.match(app, /createLocalDiveMergeGroup/);
  assert.match(app, /unmergeLocalDiveGroup/);
  assert.match(app, /projectLogbookDives/);
  assert.match(app, /t\("mergeSegments"\)/);
  assert.doesNotMatch(app, /mergeLocalDuplicateDives/);
  assert.match(app, /dive\.mergeGroupId \|\| dive\.gasConflict/);
  assert.match(en, /mergeSegments:/);
  assert.match(ja, /mergeSegments:/);
  assert.match(zhHant, /mergeSegments:/);
});
