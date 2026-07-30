import { readFileSync } from "node:fs";
import { validateDiveSitesFile, type ValidationIssue } from "../lib/dive-site-validation.js";

const path = process.argv[2];
if (!path) {
  console.error("Usage: npm run validate:sites -- path/to/dive-sites.json");
  process.exit(2);
}

let data: unknown;
try {
  data = JSON.parse(readFileSync(path, "utf8"));
} catch (error) {
  console.error(
    `Could not read or parse ${path}: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exit(2);
}

const report = validateDiveSitesFile(data);

function printGroup(title: string, issues: ValidationIssue[]) {
  if (issues.length === 0) return;
  console.log(`\n${title} (${issues.length})`);
  for (const validationIssue of issues) {
    console.log(`  [${validationIssue.code}] ${validationIssue.message}`);
  }
}

console.log(
  `Checked ${report.siteCount} sites in ${path} (${report.validSiteCount} structurally valid)`,
);
printGroup(
  "ERRORS",
  report.issues.filter(({ level }) => level === "error"),
);
printGroup(
  "WARNINGS",
  report.issues.filter(({ level }) => level === "warning"),
);
console.log(
  `\n${report.ok ? "PASS" : "FAIL"} — ${report.errorCount} error(s), ${report.warningCount} warning(s)`,
);

process.exit(report.ok ? 0 : 1);
