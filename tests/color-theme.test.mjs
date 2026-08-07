import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile("lib/color-theme.ts", "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const {
  DEFAULT_COLOR_THEME,
  isColorTheme,
  parseColorTheme,
} = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`,
);

test("color theme helpers accept only light and dark", () => {
  assert.equal(DEFAULT_COLOR_THEME, "dark");
  assert.equal(isColorTheme("dark"), true);
  assert.equal(isColorTheme("light"), true);
  assert.equal(isColorTheme("system"), false);
  assert.equal(parseColorTheme("light"), "light");
  assert.equal(parseColorTheme("nope"), null);
});
