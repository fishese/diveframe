import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = (await readFile("lib/whats-new.ts", "utf8")).replace(
  /^import .*$/m,
  "",
);
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const whatsNew = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
);

const {
  validateWhatsNewDocument,
  sanitizeWhatsNewHref,
  renderWhatsNewBody,
} = whatsNew;

test("accepts document with APK download link", () => {
  const doc = validateWhatsNewDocument({
    version: "2026-08-01",
    updatedAt: "2026-08-01T00:00:00.000Z",
    entries: [{
      id: "apk",
      title: "Android build",
      body: "New BLE GPS fix. See [notes](https://example.com/notes).",
      links: [{ label: "Download Android APK", href: "https://example.com/app-debug.apk" }],
    }],
  });
  assert.equal(doc.entries[0].links[0].label, "Download Android APK");
});

test("rejects javascript: links", () => {
  assert.equal(sanitizeWhatsNewHref("javascript:alert(1)"), null);
});

test("renderWhatsNewBody parses inline markdown links", () => {
  const parts = renderWhatsNewBody(
    "See [notes](https://example.com/notes) for details.",
  );
  assert.deepEqual(parts, [
    { type: "text", text: "See " },
    { type: "link", label: "notes", href: "https://example.com/notes" },
    { type: "text", text: " for details." },
  ]);
});
