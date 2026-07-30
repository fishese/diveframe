import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

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
