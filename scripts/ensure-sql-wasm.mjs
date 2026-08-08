import { copyFileSync, existsSync, mkdirSync } from "node:fs";
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
copyFileSync(source, target);
console.log(`Prepared ${target}`);
