export const SAMPLE_DIVE_SOURCE_ID = "id:diveframe-sample-2030";

/** Remove the demo record when the same selection also contains real dives. */
export function prepareSampleAwareImport<T extends { sourceId: string }>(
  dives: readonly T[],
) {
  const includesRealDive = dives.some(
    (dive) => dive.sourceId !== SAMPLE_DIVE_SOURCE_ID,
  );
  return {
    includesRealDive,
    dives: includesRealDive
      ? dives.filter((dive) => dive.sourceId !== SAMPLE_DIVE_SOURCE_ID)
      : [...dives],
  };
}
