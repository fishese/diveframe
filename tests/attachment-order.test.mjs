import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile("lib/attachment-order.ts", "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { moveAttachmentsAfter } = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
);

test("duplicate merge appends moved photos without sort-order collisions", () => {
  const existing = [
    { id: "keep-a", diveId: "keep", sortOrder: 0 },
    { id: "keep-b", diveId: "keep", sortOrder: 3 },
  ];
  const moving = [
    { id: "move-b", diveId: "remove", sortOrder: 4 },
    { id: "move-a", diveId: "remove", sortOrder: 0 },
  ];
  const moved = moveAttachmentsAfter(existing, moving, "keep");
  assert.deepEqual(
    moved.map(({ id, diveId, sortOrder }) => ({ id, diveId, sortOrder })),
    [
      { id: "move-a", diveId: "keep", sortOrder: 4 },
      { id: "move-b", diveId: "keep", sortOrder: 5 },
    ],
  );
});
