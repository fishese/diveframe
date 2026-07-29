type StoredImageRecord = {
  id: string;
  fileName: string;
  contentType: string;
  size: number;
  blob: Blob;
};

export function withOptimizedJpeg<T extends StoredImageRecord>(
  record: T,
  blob: Blob,
): T {
  return {
    ...record,
    fileName: jpegFileName(record.fileName),
    contentType: "image/jpeg",
    size: blob.size,
    blob,
  };
}

function jpegFileName(fileName: string) {
  return `${fileName.replace(/\.[^.]+$/, "") || "dive-photo"}.jpg`;
}
