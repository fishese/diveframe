import { createHash } from "node:crypto";
import {
  copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const runtimeFiles = ["sql-wasm.js", "sql-wasm-browser.js", "sql-wasm.wasm", "sql-wasm-browser.wasm"];
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function verifyRuntime(directory, spec, variant = "distribution") {
  const expected = spec.outputs[variant];
  if (!expected) return false;
  return runtimeFiles.every((file) =>
    existsSync(resolve(directory, file)) &&
    sha256(readFileSync(resolve(directory, file))) === expected[file]);
}

export function verifyInputs(directory, spec) {
  return Object.entries(spec.inputs).every(([file, digest]) =>
    existsSync(resolve(directory, file)) &&
    sha256(readFileSync(resolve(directory, file))) === digest);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(command + " failed (" + result.status + ")");
}

async function download(cache, name, input, offline) {
  const target = resolve(cache, name);
  if (existsSync(target) && sha256(readFileSync(target)) === input.sha256) return target;
  if (offline) throw new Error("Missing or invalid offline sql.js source input: " + name);
  const response = await fetch(input.url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error("Source download failed: " + response.status + " " + input.url);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (sha256(bytes) !== input.sha256) throw new Error("Source SHA-256 mismatch: " + name);
  const temporary = target + "." + process.pid + ".tmp";
  writeFileSync(temporary, bytes);
  renameSync(temporary, target);
  return target;
}

export async function prepareSources(root, spec, offline = false) {
  const cache = resolve(root, ".sqljs-cache");
  const downloads = resolve(cache, "downloads");
  const source = resolve(cache, "source");
  mkdirSync(downloads, { recursive: true });
  // Keep verified compressed source inputs outside scandeleted node_modules.
  for (const [name, input] of Object.entries(spec.downloads)) {
    await download(downloads, name, input, offline);
  }
  if (verifyInputs(source, spec)) return source;
  // This is only our generated source extraction directory, never user data.
  rmSync(source, { recursive: true, force: true });
  mkdirSync(source, { recursive: true });
  const prefix = "sql.js-" + spec.commit;
  run(process.platform === "win32" ? "tar.exe" : "tar", [
    "-xf", resolve(downloads, "sqljs.tar.gz"), "--strip-components=1", "-C", source,
    prefix + "/Makefile", prefix + "/src",
  ]);
  const sqlite = resolve(source, "sqlite-src");
  mkdirSync(sqlite, { recursive: true });
  if (process.platform === "win32") {
    run("tar.exe", ["-xf", resolve(downloads, "sqlite.zip"), "-C", sqlite]);
  } else {
    run("unzip", ["-q", resolve(downloads, "sqlite.zip"), "-d", sqlite]);
  }
  copyFileSync(resolve(downloads, "extension-functions.c"),
    resolve(sqlite, "sqlite-amalgamation-3490100/extension-functions.c"));
  if (!verifyInputs(source, spec)) throw new Error("Extracted sql.js source hashes do not match the pin");
  return source;
}

function compile(root, mode, spec) {
  const output = resolve(root, ".sqljs-cache/compiled");
  mkdirSync(output, { recursive: true });
  for (const file of runtimeFiles) rmSync(resolve(output, file), { force: true });
  if (mode === "debian") {
    if (process.platform === "win32") throw new Error("The Debian builder requires Docker on Linux");
    run("docker", [
      "run", "--rm", "-v", root + ":/workspace:ro", "-v", output + ":/output",
      "-e", "DIVEFRAME_SQLJS_OUTPUT=/output", "debian:trixie-slim", "sh", "-ec",
      "apt-get update && apt-get install -y --no-install-recommends emscripten=" +
        spec.debianPackage + " make && sh /workspace/scripts/compile-sqljs.sh /workspace",
    ]);
  } else if (process.platform === "win32") {
    const distro = process.env.DIVEFRAME_WSL_DISTRO;
    run("wsl.exe", [
      ...(distro ? ["-d", distro] : []), "--cd", root, "--exec",
      "sh", "scripts/compile-sqljs.sh", ".", mode,
    ]);
  } else {
    run("sh", [resolve(root, "scripts/compile-sqljs.sh"), root, mode]);
  }
  const variant = mode === "emsdk" ? "emsdk" : "distribution";
  if (!verifyRuntime(output, spec, variant)) {
    throw new Error("Compiler outputs do not match the reviewed JS/WASM pair (" + variant + ")");
  }
  return output;
}

function copyIfChanged(source, destination) {
  if (!existsSync(destination) || !readFileSync(source).equals(readFileSync(destination))) {
    copyFileSync(source, destination);
  }
}

export async function prepareRuntime(root, options = {}) {
  const specText = readFileSync(resolve(root, "scripts/sqljs-source.json"), "utf8");
  const spec = JSON.parse(specText);
  const pkg = JSON.parse(readFileSync(resolve(root, "vendor/sql.js/package.json"), "utf8"));
  if (pkg.version !== spec.version) throw new Error("sql.js package/source version mismatch");
  const offline = options.offline ?? process.env.DIVEFRAME_SQLJS_OFFLINE === "1";
  await prepareSources(root, spec, offline);
  if (options.sourcesOnly) return;
  const mode = process.env.DIVEFRAME_SQLJS_TOOLCHAIN ||
    (process.env.WORKERS_CI === "1" ? "emsdk" : "system");
  if (!["system", "debian", "emsdk"].includes(mode)) throw new Error("Unknown sql.js toolchain: " + mode);
  if (offline && mode === "emsdk") throw new Error("Use packaged Emscripten for offline/F-Droid builds");
  const variant = mode === "emsdk" ? "emsdk" : "distribution";
  const dist = resolve(root, "vendor/sql.js/dist");
  mkdirSync(dist, { recursive: true });
  if (options.rebuild || !verifyRuntime(dist, spec, variant)) {
    const output = compile(root, mode, spec);
    for (const file of runtimeFiles) copyFileSync(resolve(output, file), resolve(dist, file));
  }
  if (!verifyRuntime(dist, spec, variant)) throw new Error("sql.js runtime provenance check failed");
  const publicDir = resolve(root, "public");
  mkdirSync(publicDir, { recursive: true });
  const wasmPath = "/sql-wasm." + spec.outputs[variant]["sql-wasm.wasm"] + ".wasm";
  rmSync(resolve(publicDir, "sql-wasm.wasm"), { force: true });
  for (const file of readdirSync(publicDir)) {
    if (/^sql-wasm\.[a-f0-9]{64}\.wasm$/.test(file) && "/" + file !== wasmPath) {
      rmSync(resolve(publicDir, file));
    }
  }
  copyIfChanged(resolve(dist, "sql-wasm.wasm"), resolve(publicDir, wasmPath.slice(1)));
  writeFileSync(resolve(dist, "wasm-url.mjs"), "export default " + JSON.stringify(wasmPath) + ";\n");
  const provenance = {
    sqljs: spec.version, sourceCommit: spec.commit, sqlite: spec.sqliteVersion,
    emscripten: spec.emscripten, toolchain: variant, sourceManifestSha256: sha256(JSON.stringify(spec)),
    wasmPath, files: spec.outputs[variant],
  };
  writeFileSync(resolve(publicDir, "sqljs-provenance.json"), JSON.stringify(provenance, null, 2) + "\n");
  console.log("Prepared source-built sql.js " + spec.version + " (" + variant + ")");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  prepareRuntime(resolve(import.meta.dirname, ".."), {
    sourcesOnly: process.argv.includes("--sources-only"), rebuild: process.argv.includes("--rebuild"),
  }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
