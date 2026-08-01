import { Capacitor, registerPlugin } from "@capacitor/core";
import type { AppTranslate } from "./app-i18n";

export type NativeFileExportPlugin = {
  beginFile(options: { fileName: string; mimeType: string }): Promise<{
    token: string;
    fileName: string;
    location: string;
  }>;
  writeChunk(options: { token: string; dataBase64: string }): Promise<{
    bytesWritten: number;
  }>;
  finishFile(options: { token: string }): Promise<{
    saved: boolean;
    fileName: string;
    uri: string;
    location: string;
    bytes: number;
    shareable: boolean;
  }>;
  abortFile(options: { token: string }): Promise<{ aborted: boolean }>;
  shareFile(options: {
    uri: string;
    mimeType: string;
    title?: string;
  }): Promise<{ shared: boolean }>;
};

export type SavedExportFile =
  | { target: "browser"; fileName: string }
  | {
      target: "device";
      fileName: string;
      location: string;
      uri: string;
      shareable: boolean;
    };

/** Base64 chunk size: small enough to keep bridge strings and copies modest. */
const CHUNK_BYTES = 512 * 1024;

const nativePlugin = registerPlugin<NativeFileExportPlugin>("FileExport");

export function isNativeFileExportAvailable() {
  return (
    Capacitor.getPlatform() === "android" &&
    Capacitor.isPluginAvailable("FileExport")
  );
}

/**
 * Saves a blob as a file the user can find again. The Android WebView drops
 * `<a download>` blob URLs silently, so the native app streams the bytes into
 * the public Downloads folder instead.
 */
export async function saveExportFile(
  blob: Blob,
  fileName: string,
  mimeType?: string,
): Promise<SavedExportFile> {
  if (!isNativeFileExportAvailable()) {
    downloadInBrowser(blob, fileName);
    return { target: "browser", fileName };
  }

  const type = mimeType || blob.type || "application/octet-stream";
  const begin = await nativePlugin.beginFile({ fileName, mimeType: type });
  try {
    for (let offset = 0; offset < blob.size; offset += CHUNK_BYTES) {
      const chunk = blob.slice(offset, Math.min(offset + CHUNK_BYTES, blob.size));
      await nativePlugin.writeChunk({
        token: begin.token,
        dataBase64: await blobToBase64(chunk),
      });
    }
    const finished = await nativePlugin.finishFile({ token: begin.token });
    return {
      target: "device",
      fileName: finished.fileName,
      location: finished.location,
      uri: finished.uri,
      shareable: finished.shareable,
    };
  } catch (error) {
    await nativePlugin.abortFile({ token: begin.token }).catch(() => undefined);
    throw error;
  }
}

export async function shareExportFile(
  saved: SavedExportFile,
  options: { mimeType: string; title?: string },
) {
  if (saved.target !== "device" || !saved.shareable) return false;
  await nativePlugin.shareFile({
    uri: saved.uri,
    mimeType: options.mimeType,
    title: options.title,
  });
  return true;
}

/** Where the file landed, for flows that report progress to the user. */
export function savedFileNotice(saved: SavedExportFile, t: AppTranslate) {
  if (saved.target !== "device") return null;
  return saved.location === "Downloads"
    ? t("exportSavedToDownloads", { fileName: saved.fileName })
    : t("exportSavedToFolder", {
        fileName: saved.fileName,
        location: saved.location,
      });
}

function downloadInBrowser(blob: Blob, fileName: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const separator = result.indexOf(",");
      resolve(separator < 0 ? "" : result.slice(separator + 1));
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("Could not read the export data."));
    reader.readAsDataURL(blob);
  });
}
