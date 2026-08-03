import type { LocalDive } from "./indexed-db";

export type DuplicateDiveCandidate = {
  id: string;
  first: LocalDive;
  second: LocalDive;
  timeDifferenceSeconds: number;
  depthDifferenceM: number | null;
  durationDifferenceSeconds: number | null;
};

export function findPotentialDuplicateDives(
  dives: LocalDive[],
): DuplicateDiveCandidate[] {
  const candidates: DuplicateDiveCandidate[] = [];
  const sorted = dives
    .filter((dive) => Number.isFinite(timestamp(dive)))
    .sort((a, b) => timestamp(a) - timestamp(b));
  for (let firstIndex = 0; firstIndex < sorted.length; firstIndex += 1) {
    const first = sorted[firstIndex];
    const firstTime = timestamp(first);
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < sorted.length;
      secondIndex += 1
    ) {
      const second = sorted[secondIndex];
      const secondTime = timestamp(second);
      const timeDifferenceSeconds = Math.abs(secondTime - firstTime) / 1000;
      if (timeDifferenceSeconds > 300) break;
      const depthDifferenceM = difference(first.maxDepthM, second.maxDepthM);
      const durationDifferenceSeconds = difference(
        first.durationSeconds,
        second.durationSeconds,
      );
      if (depthDifferenceM !== null && depthDifferenceM > 2) continue;
      if (
        durationDifferenceSeconds !== null &&
        durationDifferenceSeconds > 300
      ) {
        continue;
      }
      const serialsMatch =
        first.serialNumber !== null &&
        second.serialNumber !== null &&
        normalize(first.serialNumber) === normalize(second.serialNumber);
      const sourcesDiffer = first.sources.some(
        (source) => !second.sources.includes(source),
      ) || second.sources.some((source) => !first.sources.includes(source));
      const exactProfile =
        timeDifferenceSeconds <= 90 &&
        (depthDifferenceM === null || depthDifferenceM <= 0.5) &&
        (durationDifferenceSeconds === null || durationDifferenceSeconds <= 90);
      if (!serialsMatch && !sourcesDiffer && !exactProfile) continue;
      candidates.push({
        id: [first.id, second.id].sort().join("::"),
        first,
        second,
        timeDifferenceSeconds,
        depthDifferenceM,
        durationDifferenceSeconds,
      });
    }
  }
  return candidates;
}

function timestamp(dive: LocalDive) {
  return dive.diveDate
    ? Date.parse(dive.diveDate.replace(" ", "T"))
    : Number.NaN;
}

function difference(
  first: number | null | undefined,
  second: number | null | undefined,
) {
  return first === null ||
    first === undefined ||
    second === null ||
    second === undefined
    ? null
    : Math.abs(first - second);
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}
