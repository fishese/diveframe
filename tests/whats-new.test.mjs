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

test("fetches What's New via same-origin on web and production in native", async () => {
  const whatsNewSource = await readFile("lib/whats-new.ts", "utf8");
  assert.match(whatsNewSource, /diveFrameWhatsNewUrl\(\)/);
  const apiSource = await readFile("lib/diveframe-api.ts", "utf8");
  assert.match(apiSource, /diveFrameWhatsNewUrl/);
  assert.match(apiSource, /!Capacitor\.isNativePlatform\(\)/);
  assert.match(apiSource, /return "\/api\/whats-new"/);
  const originsSource = await readFile("lib/diveframe-origins.ts", "utf8");
  assert.match(originsSource, /https:\/\/divelog\.fishese\.cc/);
  assert.match(originsSource, /https:\/\/diveframe\.fishese\.workers\.dev/);
  const corsSource = await readFile("lib/api-cors.ts", "utf8");
  assert.match(corsSource, /DIVEFRAME_HOSTED_WEB_ORIGINS/);
});

test("filters direct executable download links", () => {
  const doc = validateWhatsNewDocument({
    version: "2026-08-01",
    updatedAt: "2026-08-01T00:00:00.000Z",
    entries: [{
      id: "apk",
      title: "Android build",
      body: "New BLE GPS fix. See [notes](https://example.com/notes).",
      links: [
        { label: "Download Android APK", href: "https://example.com/app-debug.apk" },
        { label: "Release notes", href: "https://example.com/releases/v1" },
      ],
    }],
  });
  assert.deepEqual(doc.entries[0].links, [
    { label: "Release notes", href: "https://example.com/releases/v1" },
  ]);
  assert.equal(sanitizeWhatsNewHref("https://example.com/app.apks"), null);
});

test("validates immutable channel release identities", () => {
  const doc = validateWhatsNewDocument({
    version: "2026-08-20",
    updatedAt: "2026-08-20T00:00:00.000Z",
    channels: {
      preview: {
        versionName: "preview.24.abcdef0",
        versionCode: 100024,
        sourceSha: "abcdef0123456789abcdef0123456789abcdef01",
      },
      fdroid: {
        versionName: "1.0.25",
        versionCode: 26,
        sourceSha: "4dcdaa659af3fe6a873b13ed28a898afe2a774ca",
      },
    },
    entries: [],
  });
  assert.equal(doc.channels.preview.versionCode, 100024);
  assert.equal(doc.channels.fdroid.versionName, "1.0.25");
  assert.throws(() =>
    validateWhatsNewDocument({
      version: "bad",
      updatedAt: "now",
      channels: {
        preview: {
          versionName: "preview",
          versionCode: 0,
          sourceSha: "main",
        },
      },
      entries: [],
    }),
  );
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
