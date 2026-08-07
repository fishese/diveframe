import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile("lib/composer-presets.ts", "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const presets = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
);

test("composer presets exclude dive and crop-specific state", () => {
  const current = {
    id: "dive-1",
    diveId: "dive-1",
    selectedPhotoId: "photo-1",
    categoryOverride: "scuba",
    siteNameOverride: "Sharp Island",
    photoZoom: 1.4,
    photoOffsetX: 0.2,
    photoOffsetY: -0.1,
    photoRotation: 90,
    templateId: "bottom-stats-dock",
    textColor: "#f0f0f0",
    updatedAt: "2026-07-29T00:00:00.000Z",
  };

  const reusable = presets.reusableComposerSettings(current);
  assert.equal(reusable.templateId, "bottom-stats-dock");
  assert.equal(reusable.textColor, "#f0f0f0");
  assert.equal("siteNameOverride" in reusable, false);
  assert.equal("selectedPhotoId" in reusable, false);
  assert.equal("photoOffsetX" in reusable, false);
});

test("applying a preset preserves the destination dive and crop", () => {
  const current = {
    id: "dive-2",
    diveId: "dive-2",
    selectedPhotoId: "photo-2",
    categoryOverride: "freediving",
    siteNameOverride: "Local site",
    photoZoom: 1.8,
    photoOffsetX: -0.15,
    photoOffsetY: 0.25,
    photoRotation: -10,
    templateId: "bottom-profile",
    textColor: "#ffffff",
    updatedAt: "old",
  };
  const applied = presets.applyComposerPreset(current, {
    templateId: "right-panel",
    textColor: "#ffccaa",
  });

  assert.equal(applied.templateId, "right-panel");
  assert.equal(applied.textColor, "#ffccaa");
  assert.equal(applied.diveId, "dive-2");
  assert.equal(applied.siteNameOverride, "Local site");
  assert.equal(applied.categoryOverride, "freediving");
  assert.equal(applied.selectedPhotoId, "photo-2");
  assert.equal(applied.photoZoom, 1.8);
  assert.equal(applied.photoOffsetX, -0.15);
  assert.equal(applied.photoOffsetY, 0.25);
  assert.equal(applied.photoRotation, -10);
});
