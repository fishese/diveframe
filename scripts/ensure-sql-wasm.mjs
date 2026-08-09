import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "node_modules/sql.js/dist/sql-wasm.wasm");
const target = resolve(root, "public/sql-wasm.wasm");

if (!existsSync(source)) {
  console.error(
    "sql.js wasm is missing. Run npm ci before building the web or native app.",
  );
  process.exit(1);
}

mkdirSync(resolve(root, "public"), { recursive: true });
const isCurrent =
  existsSync(target) && readFileSync(source).equals(readFileSync(target));
if (!isCurrent) {
  copyFileSync(source, target);
}
console.log(`Prepared ${target}`);
