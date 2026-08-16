/**
 * Reads the sequential dive number from a raw Shearwater Petrel Native Format
 * payload.
 *
 * libdivecomputer does not expose a dive-number field. Opening record 0x10
 * stores it at bytes 2–3 as a big-endian uint16, matching the number shown on
 * the computer and Shearwater Cloud's DiveNumber. Factory test dives may be 0.
 */

const RECORD_SIZE = 32;
const RECORD_OPENING_0 = 0x10;

export function readShearwaterRawDiveNumber(
  bytes: Uint8Array,
): number | null {
  if (bytes.length < RECORD_SIZE) return null;

  for (
    let offset = 0;
    offset + RECORD_SIZE <= bytes.length;
    offset += RECORD_SIZE
  ) {
    if (bytes[offset] !== RECORD_OPENING_0) continue;
    return (bytes[offset + 2] << 8) | bytes[offset + 3];
  }

  return null;
}
