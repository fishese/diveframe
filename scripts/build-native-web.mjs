import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

/**
 * Build a static DiveFrame shell for Capacitor (`dist-native`).
 * Uses vinext `output: 'export'` via DIVEFRAME_NATIVE_STATIC=1, then copies
 * `dist/client` into `dist-native` for Capacitor's webDir.
 */
const root = resolve(import.meta.dirname, "..");
const clientDir = resolve(root, "dist", "client");
const indexHtml = resolve(clientDir, "index.html");
const outDir = resolve(root, "dist-native");

const wasmPrep = spawnSync(
  process.execPath,
  [resolve(root, "scripts/ensure-sql-wasm.mjs")],
  { cwd: root, stdio: "inherit" },
);

if (wasmPrep.status !== 0) {
  process.exit(wasmPrep.status ?? 1);
}

const build = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["vinext", "build"],
  {
    cwd: root,
    env: { ...process.env, DIVEFRAME_NATIVE_STATIC: "1" },
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

// A previous export is not evidence that this build succeeded. In particular,
// reject spawn errors, signal termination, and every nonzero exit before copying.
if (build.status !== 0) {
  console.error("Static native build failed; existing native assets were preserved.");
  process.exit(build.status ?? 1);
}

const built =
  existsSync(indexHtml) &&
  readFileSync(indexHtml, "utf8").includes("DiveFrame");

if (!built) {
  console.error(
    "Static native build did not produce a usable dist/client/index.html. " +
      "A route may still be classified as dynamic.",
  );
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
cpSync(clientDir, outDir, { recursive: true });
console.log(`Native web assets ready at ${outDir}`);
