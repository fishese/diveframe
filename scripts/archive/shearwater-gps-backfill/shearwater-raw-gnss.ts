/**
 * Reads the GNSS fix out of a raw Shearwater (Petrel Native Format) dive
 * payload.
 *
 * libdivecomputer does not expose Shearwater GPS as a parser field: it emits it
 * as a `DC_SAMPLE_LOCATION` sample while walking the profile. Reading the fixed
 * offsets directly lets stored `rawDiveRecords` be backfilled without a
 * re-download.
 *
 * Layout mirrors `shearwater_predator_parser.c`: 32-byte records keyed by a
 * leading type byte, log version at opening record 0x14 + 16, and the fix in
 * opening 0x19 (entry) / closing 0x29 (exit) at status +16, latitude +21 and
 * longitude +25 as big-endian int32 in hundred-thousandths of a degree.
 *
 * Archived from the product tree after the one-time 2026-08-01 recovery. Kept
 * here as a template for other missing-field recoveries from raw bytes.
 */

export type ShearwaterGnssFix = {
  latitude: number;
  longitude: number;
};

export type ShearwaterRawGnss = {
  logVersion: number | null;
  entry: ShearwaterGnssFix | null;
  exit: ShearwaterGnssFix | null;
};

const RECORD_SIZE = 32;
const RECORD_OPENING_4 = 0x14;
const RECORD_OPENING_9 = 0x19;
const RECORD_CLOSING_9 = 0x29;

const GNSS_FIX_2D = 2;
const GNSS_FIX_3D = 3;

/** GNSS records only exist from this Shearwater log version onwards. */
export const SHEARWATER_GNSS_MIN_LOG_VERSION = 17;

const COORDINATE_SCALE = 100000;
const STATUS_OFFSET = 16;
const LATITUDE_OFFSET = 21;
const LONGITUDE_OFFSET = 25;

const EMPTY: ShearwaterRawGnss = { logVersion: null, entry: null, exit: null };

export function readShearwaterRawGnss(bytes: Uint8Array): ShearwaterRawGnss {
  if (bytes.length < RECORD_SIZE) return EMPTY;

  // The legacy Predator format is one large block rather than 32-byte records,
  // and predates GNSS entirely.
  if (bytes[0] === 0xff && bytes[1] === 0xff) return EMPTY;

  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  );

  let logVersion: number | null = null;
  let entryOffset: number | null = null;
  let exitOffset: number | null = null;

  for (let offset = 0; offset + RECORD_SIZE <= bytes.length; offset += RECORD_SIZE) {
    const type = bytes[offset];
    if (type === RECORD_OPENING_4) {
      logVersion = bytes[offset + STATUS_OFFSET];
    } else if (type === RECORD_OPENING_9) {
      entryOffset = offset;
    } else if (type === RECORD_CLOSING_9) {
      exitOffset = offset;
    }
  }

  if (logVersion === null || logVersion < SHEARWATER_GNSS_MIN_LOG_VERSION) {
    return { logVersion, entry: null, exit: null };
  }

  return {
    logVersion,
    entry: readFix(bytes, view, entryOffset),
    exit: readFix(bytes, view, exitOffset),
  };
}

function readFix(
  bytes: Uint8Array,
  view: DataView,
  offset: number | null,
): ShearwaterGnssFix | null {
  if (offset === null) return null;
  if (offset + LONGITUDE_OFFSET + 4 > bytes.length) return null;

  const status = bytes[offset + STATUS_OFFSET];
  if (status !== GNSS_FIX_2D && status !== GNSS_FIX_3D) return null;

  const latitude = view.getInt32(offset + LATITUDE_OFFSET, false) / COORDINATE_SCALE;
  const longitude = view.getInt32(offset + LONGITUDE_OFFSET, false) / COORDINATE_SCALE;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  if (latitude === 0 && longitude === 0) return null;

  return { latitude, longitude };
}
