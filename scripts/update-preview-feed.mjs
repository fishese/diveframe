import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const PREVIEW_VERSION_CODE_BASE = 100000;
const SOURCE_SHA_PATTERN = /^[0-9a-f]{40}$/;

export function previewReleaseForRun(runNumberValue, sourceShaValue) {
  const runNumber = Number(runNumberValue);
  const sourceSha = String(sourceShaValue).trim().toLowerCase();

  if (!Number.isSafeInteger(runNumber) || runNumber < 1) {
    throw new Error("Preview run number must be a positive integer.");
  }
  if (!SOURCE_SHA_PATTERN.test(sourceSha)) {
    throw new Error("Preview source SHA must be a full lowercase commit SHA.");
  }

  return {
    versionName: `preview.${runNumber}.${sourceSha.slice(0, 7)}`,
    versionCode: PREVIEW_VERSION_CODE_BASE + runNumber,
    sourceSha,
  };
}

export function updatePreviewFeed(document, release, updatedAt) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error("What's new feed must be a JSON object.");
  }
  if (!document.channels || typeof document.channels !== "object") {
    throw new Error("What's new feed must contain channel metadata.");
  }

  return {
    ...document,
    updatedAt,
    channels: {
      ...document.channels,
      preview: release,
    },
  };
}

async function main() {
  const [runNumber, sourceSha, feedPath = "public/whats-new.json"] =
    process.argv.slice(2);
  if (!runNumber || !sourceSha) {
    throw new Error(
      "Usage: node scripts/update-preview-feed.mjs <run-number> <source-sha> [feed-path]",
    );
  }

  const release = previewReleaseForRun(runNumber, sourceSha);
  const document = JSON.parse(await readFile(feedPath, "utf8"));
  const updated = updatePreviewFeed(
    document,
    release,
    new Date().toISOString(),
  );
  await writeFile(feedPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  process.stdout.write(
    `Recorded ${release.versionName} (${release.versionCode}) in ${feedPath}.\n`,
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : null;
if (invokedPath === import.meta.url) {
  await main();
}
