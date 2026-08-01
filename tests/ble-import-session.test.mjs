import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadSession() {
  const source = await readFile("lib/ble-import-session.ts", "utf8");
  let javascript = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const stubs = {
    "./ble-persist":
      "data:text/javascript,export function deviceCheckpointId(d,s){return d+'\\0'+s.toUpperCase()}export async function prepareBlePersistFromDownload(){return{dives:[],rawRecords:[],checkpoint:null,failedParseCount:0}}",
    "./dive-computer-capability":
      "data:text/javascript,export const diveComputerCapability={isAvailable:()=>false,downloadDives:async()=>({cancelled:true,diveCount:0})}",
    "./indexed-db":
      "data:text/javascript,export async function getLocalDeviceCheckpoint(){return null}export async function clearLocalDeviceCheckpoint(){}export async function persistBleImport(){return{diveCount:0,newCount:0,alreadyPresentCount:0,checkpointAdvanced:false}}",
  };
  for (const [specifier, url] of Object.entries(stubs)) {
    javascript = javascript.replaceAll(
      new RegExp(
        `from\\s+["']${specifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
        "g",
      ),
      `from "${url}"`,
    );
  }
  return import(
    `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
  );
}

const session = await loadSession();

test("nativeLimitForQuantity maps Last N, Last 200, and Full", () => {
  assert.equal(session.nativeLimitForQuantity({ kind: "last-n", n: 15 }), 15);
  assert.equal(session.nativeLimitForQuantity({ kind: "last-n", n: 0 }), 1);
  assert.equal(session.nativeLimitForQuantity({ kind: "last-n", n: 999 }), 200);
  assert.equal(session.nativeLimitForQuantity({ kind: "last-200" }), 200);
  assert.equal(session.nativeLimitForQuantity({ kind: "full" }), 0);
});

test("checkpoint id stays descriptor + serial without account ids", () => {
  assert.equal(
    session.checkpointIdForDevice("Perdix 2", "a8e705bd"),
    "Perdix 2\u0000A8E705BD",
  );
});
