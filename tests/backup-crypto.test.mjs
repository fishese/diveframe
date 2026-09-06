import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { typescriptUrl } from "./helpers/import-typescript.mjs";

const source = await readFile("lib/backup-crypto.ts", "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const backupCrypto = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
);

test("encrypts and decrypts a backup with a short numeric password", async () => {
  const plaintext = JSON.stringify({
    format: "diveframe-local-backup",
    privateDiveData: "22.36326, 114.29319",
  });
  const envelope = await backupCrypto.encryptBackupText(plaintext, "1234");
  assert.equal(
    backupCrypto.isEncryptedBackupEnvelope(envelope),
    true,
  );
  assert.notEqual(envelope.ciphertextBase64, plaintext);
  assert.equal(
    await backupCrypto.decryptBackupEnvelope(envelope, "1234"),
    plaintext,
  );
});

test("requires the password when opening an encrypted backup", async () => {
  const envelope = await backupCrypto.encryptBackupText("backup", "2468");
  await assert.rejects(
    backupCrypto.decryptBackupEnvelope(envelope),
    (error) => error.name === "BackupPasswordRequiredError",
  );
});

test("rejects an incorrect password or modified ciphertext", async () => {
  const envelope = await backupCrypto.encryptBackupText("backup", "2468");
  await assert.rejects(
    backupCrypto.decryptBackupEnvelope(envelope, "0000"),
    (error) => error.name === "BackupPasswordIncorrectError",
  );

  const altered = {
    ...envelope,
    ciphertextBase64: `${envelope.ciphertextBase64.slice(0, -4)}AAAA`,
  };
  await assert.rejects(
    backupCrypto.decryptBackupEnvelope(altered, "2468"),
    (error) => error.name === "BackupPasswordIncorrectError",
  );
});

test("rejects an encrypted envelope with an excessive KDF work factor", async () => {
  const envelope = await backupCrypto.encryptBackupText("backup", "2468");
  envelope.encryption.iterations = 20_000_000;
  assert.equal(backupCrypto.isEncryptedBackupEnvelope(envelope), false);
});

test("current v5 backups round-trip dive samples, per-dive GPS preference and memos", async () => {
  // Exercise the real serializer, integrity check, decoding and validation;
  // substitute only the IndexedDB boundary with a synthetic current save.
  const empty = Object.fromEntries(["dives", "sourceRecords", "siteContributions", "composerSettings", "composerPresets", "attachments", "backgrounds", "brandingAssets", "appPreferences", "rawDiveRecords", "deviceCheckpoints", "trips", "supplementaryCatalog", "diveMemos", "diveMergeGroups"].map((name) => [name, []]));
  const now = "2026-09-05T12:00:00.000Z";
  const snapshot = { ...empty,
    dives: [{ id: "fixture-dive", importedAt: now, photoCount: 0, sources: ["subsurface"], diveDate: "2026-09-05 10:00:00", site: "Source site", userSite: "Edited site", gpsEntryLat: 1, gpsEntryLng: 2, userGpsLat: 3, userGpsLng: 4, exportGpsPreference: "user", buddy: "Saved buddy", notes: "Saved notes", samples: [{ elapsedSeconds: 0, depthM: 2, temperatureC: 24, pressuresBar: [200, null] }, { elapsedSeconds: 10, depthM: 8, pressuresBar: [190, 170] }] }],
    diveMemos: [{ id: "fixture-memo", heading: "Dive memo", date: "2026-09-05", hour: 10, minute: 0, meridiem: "AM", siteName: "Memo site", lat: 3, lng: 4, buddies: "Memo buddy", notes: "Memo notes", createdAt: now, updatedAt: now }],
  };
  const storage = `export async function exportLocalBackupSnapshot() { return ${JSON.stringify(snapshot)}; }
    export async function importLocalBackupSnapshot() { throw new Error("Unexpected write during backup preview"); }`;
  const storageUrl = `data:text/javascript;base64,${Buffer.from(storage).toString("base64")}`;
  let javascript = ts.transpileModule(await readFile("lib/app-backup.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  javascript = javascript.replaceAll('from "./indexed-db"', `from "${storageUrl}"`);
  for (const path of ["backup-crypto", "backup-record-validation"]) javascript = javascript.replaceAll(`from "./${path}"`, `from "${await typescriptUrl(`lib/${path}.ts`)}"`);
  const backup = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
  for (const password of [undefined, "2468"]) {
    const exported = await backup.createLocalAppBackup(password);
    if (!password) assert.equal(JSON.parse(await exported.blob.text()).version, 5);
    const preview = await backup.previewLocalAppBackup(new File([exported.blob], "current-save.json"), password);
    assert.equal(preview.integrity, "verified");
    assert.deepEqual(preview.snapshot, snapshot);
  }
});
