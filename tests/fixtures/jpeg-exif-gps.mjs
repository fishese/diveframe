// Builds tiny synthetic JPEG buffers with (or without) a minimal EXIF GPS
// IFD, so tests/dive-gps.test.mjs can exercise lib/photo-exif-gps.ts without
// checking a binary fixture into the repo.

const TIFF_TYPE_ASCII = 2;
const TIFF_TYPE_LONG = 4;
const TIFF_TYPE_RATIONAL = 5;

const GPS_IFD_POINTER_TAG = 0x8825;
const GPS_LATITUDE_REF_TAG = 0x0001;
const GPS_LATITUDE_TAG = 0x0002;
const GPS_LONGITUDE_REF_TAG = 0x0003;
const GPS_LONGITUDE_TAG = 0x0004;

class ByteWriter {
  constructor() {
    this.chunks = [];
    this.length = 0;
  }

  writeBytes(bytes) {
    const buffer = Buffer.from(bytes);
    this.chunks.push(buffer);
    this.length += buffer.length;
    return this.length - buffer.length;
  }

  writeAscii(text) {
    return this.writeBytes(Buffer.from(text, "ascii"));
  }

  writeUint16LE(value) {
    const buffer = Buffer.alloc(2);
    buffer.writeUInt16LE(value, 0);
    return this.writeBytes(buffer);
  }

  writeUint32LE(value) {
    const buffer = Buffer.alloc(4);
    buffer.writeUInt32LE(value, 0);
    return this.writeBytes(buffer);
  }

  toBuffer() {
    return Buffer.concat(this.chunks);
  }
}

function toDms(decimalAbsolute) {
  const degrees = Math.floor(decimalAbsolute);
  const minutesFull = (decimalAbsolute - degrees) * 60;
  const minutes = Math.floor(minutesFull);
  const seconds = (minutesFull - minutes) * 60;
  return { degrees, minutes, seconds };
}

function writeRational(writer, numerator, denominator) {
  writer.writeUint32LE(numerator);
  writer.writeUint32LE(denominator);
}

function writeDmsRationals(writer, dms) {
  writeRational(writer, dms.degrees, 1);
  writeRational(writer, dms.minutes, 1);
  writeRational(writer, Math.round(dms.seconds * 10000), 10000);
}

/** IFD0 with a single GPS-IFD-pointer entry, followed immediately by the GPS IFD. */
function buildTiffWithGps({ latitude, longitude }) {
  const latRef = latitude < 0 ? "S" : "N";
  const lonRef = longitude < 0 ? "W" : "E";
  const latDms = toDms(Math.abs(latitude));
  const lonDms = toDms(Math.abs(longitude));

  const HEADER_SIZE = 8;
  const IFD0_SIZE = 2 + 1 * 12 + 4; // one entry: GPS IFD pointer
  const GPS_IFD_SIZE = 2 + 4 * 12 + 4; // four entries: lat ref/lat/lon ref/lon
  const ifd0Offset = HEADER_SIZE;
  const gpsIfdOffset = ifd0Offset + IFD0_SIZE;
  const latDataOffset = gpsIfdOffset + GPS_IFD_SIZE;
  const lonDataOffset = latDataOffset + 24;

  const writer = new ByteWriter();
  writer.writeAscii("II");
  writer.writeUint16LE(42);
  writer.writeUint32LE(ifd0Offset);

  // IFD0
  writer.writeUint16LE(1);
  writer.writeUint16LE(GPS_IFD_POINTER_TAG);
  writer.writeUint16LE(TIFF_TYPE_LONG);
  writer.writeUint32LE(1);
  writer.writeUint32LE(gpsIfdOffset);
  writer.writeUint32LE(0); // next IFD offset

  // GPS IFD
  writer.writeUint16LE(4);
  writer.writeUint16LE(GPS_LATITUDE_REF_TAG);
  writer.writeUint16LE(TIFF_TYPE_ASCII);
  writer.writeUint32LE(2);
  writer.writeBytes([latRef.charCodeAt(0), 0, 0, 0]);

  writer.writeUint16LE(GPS_LATITUDE_TAG);
  writer.writeUint16LE(TIFF_TYPE_RATIONAL);
  writer.writeUint32LE(3);
  writer.writeUint32LE(latDataOffset);

  writer.writeUint16LE(GPS_LONGITUDE_REF_TAG);
  writer.writeUint16LE(TIFF_TYPE_ASCII);
  writer.writeUint32LE(2);
  writer.writeBytes([lonRef.charCodeAt(0), 0, 0, 0]);

  writer.writeUint16LE(GPS_LONGITUDE_TAG);
  writer.writeUint16LE(TIFF_TYPE_RATIONAL);
  writer.writeUint32LE(3);
  writer.writeUint32LE(lonDataOffset);

  writer.writeUint32LE(0); // next IFD offset

  writeDmsRationals(writer, latDms);
  writeDmsRationals(writer, lonDms);

  return writer.toBuffer();
}

/** IFD0 with zero entries — valid EXIF TIFF structure, no GPS IFD pointer. */
function buildTiffWithoutGps() {
  const writer = new ByteWriter();
  writer.writeAscii("II");
  writer.writeUint16LE(42);
  writer.writeUint32LE(8);
  writer.writeUint16LE(0); // zero IFD0 entries
  writer.writeUint32LE(0); // next IFD offset
  return writer.toBuffer();
}

function wrapAsJpeg(tiffBuffer) {
  const exifPayload = Buffer.concat([Buffer.from("Exif\0\0", "ascii"), tiffBuffer]);
  const app1Length = exifPayload.length + 2; // includes the two length bytes
  const app1LengthBuffer = Buffer.alloc(2);
  app1LengthBuffer.writeUInt16BE(app1Length, 0);

  return Buffer.concat([
    Buffer.from([0xff, 0xd8]), // SOI
    Buffer.from([0xff, 0xe1]), // APP1
    app1LengthBuffer,
    exifPayload,
    Buffer.from([0xff, 0xd9]), // EOI
  ]);
}

function toArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

export function buildJpegWithGps(coordinates) {
  return toArrayBuffer(wrapAsJpeg(buildTiffWithGps(coordinates)));
}

export function buildJpegWithoutGps() {
  return toArrayBuffer(wrapAsJpeg(buildTiffWithoutGps()));
}

export function buildNonJpegBuffer() {
  return toArrayBuffer(Buffer.from("not a jpeg file", "ascii"));
}
