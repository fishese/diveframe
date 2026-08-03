import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Framework and generated build output. Linting generated Android/Vite
    // bundles hid actionable source errors behind thousands of diagnostics.
    ".next/**",
    "out/**",
    "build/**",
    "dist/**",
    "dist-native/**",
    ".wrangler/**",
    "android/.gradle/**",
    "android/build/**",
    "android/app/build/**",
    "android/app/src/main/assets/**",
    // Archived one-off recovery tools are retained as historical artifacts,
    // not maintained as part of the current application build.
    "scripts/archive/**",
    "coverage/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
