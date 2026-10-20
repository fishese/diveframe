# Source-built sql.js runtime

DiveFrame uses sql.js 1.14.1 / SQLite 3.49.1 for Shearwater database-file imports.
It does not use SQL.js as its logbook store. IndexedDB, backups, and the native
Bluetooth bridge are unchanged.

The npm dependency is a source-only local package at vendor/sql.js. No WASM or
generated loader is committed. npm ci cannot restore an npm sql.js binary.

## Source and runtime provenance

scripts/sqljs-source.json pins the exact sql.js commit, SHA-256 of all downloaded
source archives/C inputs, and expected hashes for both generated JS/WASM pairs.
The upstream MIT notice is retained in vendor/sql.js/LICENSE; SQLite is public
domain. The extension C source retains its upstream notices.

npm run prepare:sql-wasm downloads and verifies source inputs into .sqljs-cache,
extracts only required sources, and compiles in a fresh temporary directory.
It preserves upstream SQLite feature flags and -Oz/-flto, omitting the optional
Closure optimization to avoid a separate precompiled Closure tool.

The browser/default generated loaders and their WASM must match one reviewed
output set. Missing/corrupt source or mismatched output fails the build. There
is no npm prebuilt fallback or scanner exception.

Generated output:
- vendor/sql.js/dist/: paired loaders, WASM and generated URL module.
- public/sql-wasm.SHA256.wasm: content-addressed client binary.
- public/sqljs-provenance.json: source/compiler/output provenance and WASM URL.

The client imports that generated URL. The service worker caches the matching
WASM during shell installation and evicts the old shell cache on upgrade. It
never resets or accesses IndexedDB. An old cache entry for /sql-wasm.wasm cannot
satisfy the new hash-specific URL.

Vite configuration prepares the runtime too, so direct vinext/Vite builds cannot
silently skip preparation. npm dev and native:sync also prepare it.

## Compiler environments

All environments use Emscripten 3.1.69 and the same source/features:

- Windows development uses WSL's packaged emcc. Optionally select the distro with
  DIVEFRAME_WSL_DISTRO. The validated Ubuntu 26.04 distribution outputs match
  a clean Debian trixie build byte for byte.
- Linux defaults to packaged emcc 3.1.69.
- Preview/reference GitHub workflows set DIVEFRAME_SQLJS_TOOLCHAIN=debian.
  The helper uses Debian trixie in Docker with emscripten=3.1.69+dfsg-3.
- Cloudflare Workers Builds sets WORKERS_CI=1. The helper automatically uses the
  non-root official SDK bootstrap, pinned to emsdk commit
  a36df02dc438e8b02f91122a4c62eeecb6784272 / version 3.1.69.
  It needs Git, Python 3, tar/unzip, internet access and writable build storage.
  Cloudflare's standard image provides these prerequisites. No signing secret,
  API token or compiler setting is required. First builds download the SDK and
  build its standard libraries; later preparation in the same build reuses it.

The SDK and Debian compiler distributions generate distinct, separately pinned
binaries. Both are source-built from the same sql.js/SQLite inputs and tested
against the same parser contracts. APK/reference/F-Droid comparisons must use
the Debian set consistently; do not compare the SDK set to the Debian set.

Useful commands:
  npm run prepare:sql-wasm
  node scripts/ensure-sql-wasm.mjs --sources-only
  node scripts/ensure-sql-wasm.mjs --rebuild

To explicitly test the Cloudflare path, set DIVEFRAME_SQLJS_TOOLCHAIN=emsdk.
To use CI's Debian Docker compiler, set DIVEFRAME_SQLJS_TOOLCHAIN=debian.

## F-Droid recipe integration

Do not move or replace the immutable 1.0.29 source/reference tags.

The recipe must provide the validated Debian toolchain, prepare the verified
source cache during prebuild, and compile after scanner cleanup. Set
DIVEFRAME_SQLJS_OFFLINE=1 in the offline build stage.
That flag prohibits source downloads and the SDK bootstrap. Never use the SDK
bootstrap in an F-Droid build.

Keep extracted C/JS under .sqljs-cache/source outside node_modules. Remove the
downloaded source archives after extraction, before scanning. The offline build
accepts only extracted files whose hashes match every pinned input. It is safe
for the scanner to remove generated WASM, objects, node_modules, static exports
and packaged assets: preparation rebuilds from verified source.
Do not scanignore a generated runtime or ship npm's sql-wasm.wasm.

A source preparation example (from the app repository root):
  npm ci
  node scripts/ensure-sql-wasm.mjs --sources-only
  rm -rf .sqljs-cache/downloads

After scanner cleanup (with source cache and packaged Emscripten available):
  npm ci --offline
  DIVEFRAME_SQLJS_OFFLINE=1 npm run native:sync

The recipe must pin the immutable stable source commit and matching signed
reference APK. Its pipeline must pass the full F-Droid/reference comparison.

## Validation and device acceptance

npm test includes local-package/provenance checks, missing/corrupt source and
runtime rejection, synthetic Shearwater import through the shared parser, and
service-worker offline/upgrade checks. Before release also run lint, native:sync,
clean Android builds, and inspect the actual APK WASM digest.

The separately signed source-runtime test APK was accepted by the maintainer on
2026-10-20 after device testing. Normal Preview and stable retain their original
package IDs/signing so existing installations update in place. Test app package
overrides and its disposable signing key are not part of this repository.

Manual regression checks: import a real Shearwater database offline; reimport
without duplicates; download overlapping history over classic Shearwater BLE;
cancel a longer transfer; restart offline; and check a copied app-data backup
round trip. Preserve the real logbook and original backup throughout testing.
