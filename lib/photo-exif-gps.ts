import { gps as readExifGps } from "exifr/dist/lite.esm.js";

/**
 * Minimal JPEG EXIF GPS reader retained as a narrow, dependency-free fallback
 * and regression-test fixture. The cross-format reader below uses exifr's
 * lite bundle for JPEG plus HEIC/HEIF metadata.
 */

export type PhotoGpsCoordinates = {
  latitude: number;
  longitude: number;
};

const JPEG_SOI = 0xffd8;
const APP1_MARKER = 0xffe1;
const START_OF_SCAN_MARKER = 0xffda;
const EXIF_HEADER = "Exif\0\0";

const GPS_IFD_POINTER_TAG = 0x8825;
const GPS_LATITUDE_REF_TAG = 0x0001;
const GPS_LATITUDE_TAG = 0x0002;
const GPS_LONGITUDE_REF_TAG = 0x0003;
const GPS_LONGITUDE_TAG = 0x0004;

const TIFF_TYPE_LONG = 4;

type ByteOrder = "little" | "big";

type IfdEntry = {
  tag: number;
  type: number;
  count: number;
  /** Absolute offset (into the buffer) of the entry's 4-byte value field. */
  valueFieldOffset: number;
};

function readUint16(view: DataView, offset: number, order: ByteOrder): number {
  return view.getUint16(offset, order === "little");
}

function readUint32(view: DataView, offset: number, order: ByteOrder): number {
  return view.getUint32(offset, order === "little");
}

function readRational(view: DataView, offset: number, order: ByteOrder): number {
  const numerator = readUint32(view, offset, order);
  const denominator = readUint32(view, offset + 4, order);
  return denominator === 0 ? 0 : numerator / denominator;
}

function bytesToAscii(view: DataView, offset: number, length: number): string {
  let result = "";
  for (let index = 0; index < length; index += 1) {
    result += String.fromCharCode(view.getUint8(offset + index));
  }
  return result;
}

function dmsToDecimal(degrees: number, minutes: number, seconds: number): number {
  return degrees + minutes / 60 + seconds / 3600;
}

function findExifTiffStart(view: DataView): number | null {
  if (view.byteLength < 4 || view.getUint16(0) !== JPEG_SOI) return null;

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset);
    if ((marker & 0xff00) !== 0xff00) return null;
    if (marker === START_OF_SCAN_MARKER) return null;

    const segmentLength = view.getUint16(offset + 2);
    if (marker === APP1_MARKER) {
      const headerOffset = offset + 4;
      if (
        headerOffset + EXIF_HEADER.length <= view.byteLength &&
        bytesToAscii(view, headerOffset, EXIF_HEADER.length) === EXIF_HEADER
      ) {
        return headerOffset + EXIF_HEADER.length;
      }
    }
    offset += 2 + segmentLength;
  }
  return null;
}

function readIfdEntries(
  view: DataView,
  tiffStart: number,
  ifdOffset: number,
  order: ByteOrder,
): IfdEntry[] {
  const entryCount = readUint16(view, tiffStart + ifdOffset, order);
  const entries: IfdEntry[] = [];
  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = tiffStart + ifdOffset + 2 + index * 12;
    entries.push({
      tag: readUint16(view, entryOffset, order),
      type: readUint16(view, entryOffset + 2, order),
      count: readUint32(view, entryOffset + 4, order),
      valueFieldOffset: entryOffset + 8,
    });
  }
  return entries;
}

function readCoordinateMagnitude(
  view: DataView,
  tiffStart: number,
  entry: IfdEntry,
  order: ByteOrder,
): number {
  const dataOffset = tiffStart + readUint32(view, entry.valueFieldOffset, order);
  const degrees = readRational(view, dataOffset, order);
  const minutes = readRational(view, dataOffset + 8, order);
  const seconds = readRational(view, dataOffset + 16, order);
  return dmsToDecimal(degrees, minutes, seconds);
}

function readAsciiRefChar(view: DataView, entry: IfdEntry): string {
  return String.fromCharCode(view.getUint8(entry.valueFieldOffset));
}

function readGpsCoordinates(
  view: DataView,
  tiffStart: number,
  gpsIfdOffset: number,
  order: ByteOrder,
): PhotoGpsCoordinates | null {
  const entries = readIfdEntries(view, tiffStart, gpsIfdOffset, order);
  const byTag = new Map(entries.map((entry) => [entry.tag, entry]));
  const latRef = byTag.get(GPS_LATITUDE_REF_TAG);
  const lat = byTag.get(GPS_LATITUDE_TAG);
  const lngRef = byTag.get(GPS_LONGITUDE_REF_TAG);
  const lng = byTag.get(GPS_LONGITUDE_TAG);
  if (!latRef || !lat || !lngRef || !lng) return null;

  const latitudeMagnitude = readCoordinateMagnitude(view, tiffStart, lat, order);
  const longitudeMagnitude = readCoordinateMagnitude(view, tiffStart, lng, order);
  const latitude =
    readAsciiRefChar(view, latRef) === "S" ? -latitudeMagnitude : latitudeMagnitude;
  const longitude =
    readAsciiRefChar(view, lngRef) === "W" ? -longitudeMagnitude : longitudeMagnitude;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude === 0 && longitude === 0) return null;
  return { latitude, longitude };
}

export async function readJpegExifGps(
  buffer: ArrayBuffer,
): Promise<PhotoGpsCoordinates | null> {
  try {
    const view = new DataView(buffer);
    const tiffStart = findExifTiffStart(view);
    if (tiffStart === null) return null;

    const byteOrderMark = bytesToAscii(view, tiffStart, 2);
    const order: ByteOrder | null =
      byteOrderMark === "II" ? "little" : byteOrderMark === "MM" ? "big" : null;
    if (!order) return null;
    if (readUint16(view, tiffStart + 2, order) !== 42) return null;

    const ifd0Offset = readUint32(view, tiffStart + 4, order);
    const ifd0Entries = readIfdEntries(view, tiffStart, ifd0Offset, order);
    const gpsPointer = ifd0Entries.find((entry) => entry.tag === GPS_IFD_POINTER_TAG);
    if (!gpsPointer || gpsPointer.type !== TIFF_TYPE_LONG) return null;

    const gpsIfdOffset = readUint32(view, gpsPointer.valueFieldOffset, order);
    return readGpsCoordinates(view, tiffStart, gpsIfdOffset, order);
  } catch {
    return null;
  }
}

/**
 * Reads GPS coordinates from browser-selected JPEG or HEIC/HEIF bytes.
 * Exifr's lite browser bundle only loads the metadata structures needed for
 * GPS, so this does not decode or rewrite the selected image.
 */
export async function readPhotoExifGps(
  buffer: ArrayBuffer,
): Promise<PhotoGpsCoordinates | null> {
  try {
    const coordinates = await readExifGps(buffer);
    if (
      !coordinates ||
      !Number.isFinite(coordinates.latitude) ||
      !Number.isFinite(coordinates.longitude) ||
      (coordinates.latitude === 0 && coordinates.longitude === 0)
    ) {
      return null;
    }
    return {
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
    };
  } catch {
    return null;
  }
}
