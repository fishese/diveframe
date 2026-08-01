import type { CanvasRatio, ComposerSettings } from "./composer-settings";
import type { Dive } from "./dive-model";
import { renderComposition } from "./image-composer";
import { ensureOverlayFont } from "./composer-fonts";
import { exportFileName } from "./export-file-name";
import { saveExportFile } from "./file-export";

export function outputDimensions(
  image: { width: number; height: number },
  settings: ComposerSettings,
) {
  const ratio = ratioNumber(settings.ratio, image.width / image.height);
  if (settings.outputSize === "source") {
    const area = image.width * image.height;
    const width = Math.round(Math.sqrt(area * ratio));
    return { width, height: Math.round(width / ratio) };
  }
  const longEdge = settings.outputSize === "social" ? 1350 : 3000;
  return ratio >= 1
    ? { width: longEdge, height: Math.round(longEdge / ratio) }
    : { width: Math.round(longEdge * ratio), height: longEdge };
}

export async function exportComposition(
  image: CanvasImageSource & { width: number; height: number },
  dive: Dive,
  settings: ComposerSettings,
  logo?: CanvasImageSource & { width: number; height: number },
) {
  await ensureOverlayFont(settings.fontFamily);
  const dimensions = outputDimensions(image, settings);
  const canvas = document.createElement("canvas");
  renderComposition(canvas, image, dive, settings, dimensions.width, dimensions.height, logo);
  const mime = settings.format === "png" ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error("Could not create image.")),
      mime,
      settings.jpegQuality,
    ),
  );
  const fileName = `${exportFileName(dive.startDateTime)}.${settings.format === "png" ? "png" : "jpg"}`;
  return saveExportFile(blob, fileName, mime);
}

function ratioNumber(ratio: CanvasRatio, original: number) {
  if (ratio === "original") return original;
  const [width, height] = ratio.split(":").map(Number);
  return width / height;
}
