import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile("lib/buddy-names.ts", "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const {
  collectBuddyNames,
  completeBuddyToken,
  currentBuddyToken,
  matchBuddySuggestions,
  splitBuddyNames,
} = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`,
);

test("splits ASCII, fullwidth, and ideographic commas", () => {
  assert.deepEqual(splitBuddyNames("Alice, Bob"), ["Alice", "Bob"]);
  assert.deepEqual(splitBuddyNames("Alice，Bob"), ["Alice", "Bob"]);
  assert.deepEqual(splitBuddyNames("Alice、Bob"), ["Alice", "Bob"]);
  assert.deepEqual(splitBuddyNames(" Alice , Bob 、 Carol "), [
    "Alice",
    "Bob",
    "Carol",
  ]);
});

test("collects unique buddy names sorted case-insensitively", () => {
  const names = collectBuddyNames([
    { buddy: "Bob, Alice" },
    { buddy: "alice、Carol" },
    { buddy: null },
  ]);
  assert.deepEqual(new Set(names), new Set(["Alice", "Bob", "Carol", "alice"]));
  assert.equal(names.length, 4);
});

test("completes only the current buddy token", () => {
  assert.deepEqual(currentBuddyToken("Ali"), {
    prefix: "",
    separator: "",
    token: "Ali",
  });
  assert.deepEqual(currentBuddyToken("Alice, Bo"), {
    prefix: "Alice",
    separator: ", ",
    token: "Bo",
  });
  assert.equal(completeBuddyToken("Alice、Bo", "Bob"), "Alice、Bob");
  assert.equal(completeBuddyToken("Al", "Alice"), "Alice");
});

test("matches suggestions against the active token", () => {
  const known = ["Alice", "Bob", "Bobby", "Carol"];
  assert.deepEqual(matchBuddySuggestions("Bo", known), ["Bob", "Bobby"]);
  assert.deepEqual(matchBuddySuggestions("Alice, Bo", known), ["Bob", "Bobby"]);
  assert.deepEqual(matchBuddySuggestions("Alice, ", known), []);
  assert.deepEqual(matchBuddySuggestions("Alice, Bob", known), []);
});
