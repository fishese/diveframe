export type OrderedAttachment = {
  diveId: string;
  sortOrder: number;
};

/**
 * Moves one dive's attachments behind another dive's existing gallery while
 * preserving the moved gallery's relative order.
 */
export function moveAttachmentsAfter<T extends OrderedAttachment>(
  existing: readonly T[],
  moving: readonly T[],
  destinationDiveId: string,
): T[] {
  const nextSortOrder =
    existing.reduce(
      (maximum, attachment) =>
        Number.isFinite(attachment.sortOrder)
          ? Math.max(maximum, attachment.sortOrder)
          : maximum,
      -1,
    ) + 1;
  return [...moving]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((attachment, index) => ({
      ...attachment,
      diveId: destinationDiveId,
      sortOrder: nextSortOrder + index,
    }));
}
