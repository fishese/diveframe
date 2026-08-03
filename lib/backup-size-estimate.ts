/**
 * Backup size estimates should not require base64-encoding every media blob.
 * Binary payload size is taken from stored byte lengths; metadata JSON covers
 * the rest of the document shape (without binary fields).
 */

export type BackupSizeEstimateInput = {
  metadataJsonBytes: number;
  mediaBytes: number;
  rawBytes: number;
  fingerprintBytes: number;
};

export type BackupSizeEstimate = {
  mediaBytes: number;
  rawBytes: number;
  estimatedBackupBytes: number;
  divePhotos: number;
  backgrounds: number;
  rawDiveRecords: number;
};

/**
 * Approximate base64 expansion used by the existing backup size warning
 * thresholds. Matches the previous estimate formula so UI cutoffs stay stable.
 */
export function base64EncodedLength(binaryBytes: number) {
  if (!Number.isFinite(binaryBytes) || binaryBytes <= 0) return 0;
  return Math.ceil((binaryBytes * 4) / 3);
}

export function estimateBackupBytes(input: BackupSizeEstimateInput) {
  const binaryBytes =
    input.mediaBytes + input.rawBytes + input.fingerprintBytes;
  return input.metadataJsonBytes + base64EncodedLength(binaryBytes);
}

export function buildBackupSizeEstimate(
  input: BackupSizeEstimateInput & {
    divePhotos: number;
    backgrounds: number;
    rawDiveRecords: number;
  },
): BackupSizeEstimate {
  return {
    mediaBytes: input.mediaBytes,
    rawBytes: input.rawBytes,
    estimatedBackupBytes: estimateBackupBytes(input),
    divePhotos: input.divePhotos,
    backgrounds: input.backgrounds,
    rawDiveRecords: input.rawDiveRecords,
  };
}

export function omitBinaryFields<T extends Record<string, unknown>>(
  record: T,
  keys: readonly string[],
): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...record };
  for (const key of keys) {
    delete copy[key];
  }
  return copy;
}
