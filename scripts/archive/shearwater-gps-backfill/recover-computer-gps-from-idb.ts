/**
 * Former in-app IndexedDB helper (removed from lib/indexed-db.ts after the
 * one-time recovery). Reference only — not imported by the product build.
 *
 * To temporarily re-wire: import readShearwaterRawGnss from the sibling
 * extractor, call this from a Settings action, then remove again.
 */

import {
  readShearwaterRawGnss,
  type ShearwaterRawGnss,
} from "./shearwater-raw-gnss";

export type LocalRawDiveRecordLike = {
  diveId: string;
  rawBytes?: Blob;
};

export type LocalDiveGpsLike = {
  id: string;
  gpsEntryLat: number | null;
  gpsEntryLng: number | null;
  gpsExitLat: number | null;
  gpsExitLng: number | null;
};

export type RecoveredComputerGpsSummary = {
  scanned: number;
  updated: number;
  alreadyPresent: number;
  withoutFix: number;
};

/**
 * Fills empty gpsEntry/gpsExit fields from stored raw BLE payloads.
 * Does not overwrite coordinates that are already present.
 */
export async function recoverComputerGpsFromRawRecords(options: {
  listRawRecords: () => Promise<LocalRawDiveRecordLike[]>;
  getDive: (id: string) => Promise<LocalDiveGpsLike | undefined>;
  putDive: (dive: LocalDiveGpsLike) => Promise<void>;
}): Promise<RecoveredComputerGpsSummary> {
  const rawRecords = await options.listRawRecords();
  const fixesByDiveId = new Map<string, ShearwaterRawGnss>();

  for (const record of rawRecords) {
    if (!record.rawBytes) continue;
    const bytes = new Uint8Array(await record.rawBytes.arrayBuffer());
    const gnss = readShearwaterRawGnss(bytes);
    if (gnss.entry || gnss.exit) fixesByDiveId.set(record.diveId, gnss);
  }

  const summary: RecoveredComputerGpsSummary = {
    scanned: rawRecords.length,
    updated: 0,
    alreadyPresent: 0,
    withoutFix: rawRecords.length - fixesByDiveId.size,
  };
  if (fixesByDiveId.size === 0) return summary;

  for (const [diveId, gnss] of fixesByDiveId) {
    const dive = await options.getDive(diveId);
    if (!dive) continue;
    if (dive.gpsEntryLat !== null && dive.gpsEntryLat !== undefined) {
      summary.alreadyPresent += 1;
      continue;
    }
    await options.putDive({
      ...dive,
      gpsEntryLat: gnss.entry?.latitude ?? dive.gpsEntryLat ?? null,
      gpsEntryLng: gnss.entry?.longitude ?? dive.gpsEntryLng ?? null,
      gpsExitLat: gnss.exit?.latitude ?? dive.gpsExitLat ?? null,
      gpsExitLng: gnss.exit?.longitude ?? dive.gpsExitLng ?? null,
    });
    summary.updated += 1;
  }
  return summary;
}
