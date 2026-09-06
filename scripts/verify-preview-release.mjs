import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { previewReleaseForRun } from "./update-preview-feed.mjs";

export function verifyPreviewRelease(published, expected, sha256, tagSha) {
  if (!/^[0-9a-f]{64}$/.test(sha256 ?? "")) throw new Error("Expected APK SHA-256 is missing or invalid.");
  if (tagSha !== expected.sourceSha) throw new Error("Preview Git tag does not match the APK source.");
  if (published.tag_name !== "preview" || published.draft || !published.prerelease || published.target_commitish !== expected.sourceSha) {
    throw new Error("Published Preview source/channel does not match the build.");
  }
  const lines = (published.body ?? "").split(/\r?\n/);
  for (const line of [
    `Commit: ${expected.sourceSha}`,
    "Package: cc.fishese.divelog.preview",
    `Version name: ${expected.versionName}`,
    `Version code: ${expected.versionCode}`,
    `APK SHA-256: ${sha256}`,
  ]) {
    if (!lines.includes(line)) throw new Error(`Published Preview is missing exact provenance: ${line}`);
  }
  const assets = (published.assets ?? []).filter((asset) => asset.name === "diveframe-preview.apk");
  if (assets.length !== 1 || assets[0].state !== "uploaded" || assets[0].digest !== `sha256:${sha256}`) {
    throw new Error("Published Preview APK digest does not match the signed build.");
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [run, sourceSha, sha256] = process.argv.slice(2);
  const repository = process.env.GITHUB_REPOSITORY;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? "")) throw new Error("GITHUB_REPOSITORY is required.");
  const published = JSON.parse(execFileSync("gh", ["api", `repos/${repository}/releases/tags/preview`], { encoding: "utf8" }));
  const tag = JSON.parse(execFileSync("gh", ["api", `repos/${repository}/git/ref/tags/preview`], { encoding: "utf8" }));
  verifyPreviewRelease(published, previewReleaseForRun(run, sourceSha), sha256, tag.object?.sha);
  console.log("Published Preview tag, source, version and signed APK digest match.");
}
