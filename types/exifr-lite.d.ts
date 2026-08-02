declare module "exifr/dist/lite.esm.js" {
  export function gps(
    data: ArrayBuffer | Uint8Array | Blob | File,
  ): Promise<{ latitude: number; longitude: number } | undefined>;
}
