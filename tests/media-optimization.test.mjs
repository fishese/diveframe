import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile("lib/media-optimization.ts", "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const media = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
);

test("JPEG optimization preserves attachment identity and dive links", () => {
  const original = {
    id: "photo-stable-id",
    diveId: "subsurface:device:dive",
    fileName: "reef.profile.png",
    contentType: "image/png",
    size: 5000,
    caption: "Bow section",
    sortOrder: 2,
    createdAt: "2026-07-29T00:00:00.000Z",
    blob: new Blob(["original"], { type: "image/png" }),
  };
  const jpeg = new Blob(["smaller"], { type: "image/jpeg" });
  const optimized = media.withOptimizedJpeg(original, jpeg);

  assert.equal(optimized.id, original.id);
  assert.equal(optimized.diveId, original.diveId);
  assert.equal(optimized.caption, original.caption);
  assert.equal(optimized.sortOrder, original.sortOrder);
  assert.equal(optimized.createdAt, original.createdAt);
  assert.equal(optimized.fileName, "reef.profile.jpg");
  assert.equal(optimized.contentType, "image/jpeg");
  assert.equal(optimized.blob, jpeg);
});

test("JPEG optimization preserves reusable background names", () => {
  const original = {
    id: "background-stable-id",
    fileName: "bubbles.png",
    displayName: "Blue bubbles",
    contentType: "image/png",
    size: 5000,
    createdAt: "2026-07-29T00:00:00.000Z",
    blob: new Blob(["original"], { type: "image/png" }),
  };
  const optimized = media.withOptimizedJpeg(
    original,
    new Blob(["smaller"], { type: "image/jpeg" }),
  );

  assert.equal(optimized.id, original.id);
  assert.equal(optimized.displayName, original.displayName);
  assert.equal(optimized.fileName, "bubbles.jpg");
});
