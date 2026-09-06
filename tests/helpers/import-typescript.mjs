import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import ts from "typescript";

const cache = new Map();
export async function typescriptUrl(path) {
  const absolute = resolve(path);
  if (cache.has(absolute)) return cache.get(absolute);
  let javascript = ts.transpileModule(await readFile(absolute, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const match of [...javascript.matchAll(/from\s+["'](\.[^"']+)["']/g)]) {
    const dependency = await typescriptUrl(resolve(dirname(absolute), `${match[1]}.ts`));
    javascript = javascript.replace(match[0], `from "${dependency}"`);
  }
  const url = `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`;
  cache.set(absolute, url);
  return url;
}
