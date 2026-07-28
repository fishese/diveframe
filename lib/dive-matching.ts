import type { LocalDive, LocalImportedDive } from "./indexed-db";

export function findMatchingDive(
  incoming: LocalImportedDive,
  candidates: LocalDive[],
) {
  if (!incoming.diveDate) return null;
  const incomingTime = parseDiveDate(incoming.diveDate);
  const incomingSerial = normalizeSerial(incoming.serialNumber);
  const incomingDepth = nullableNumber(incoming.depth);
  let best: { id: string; score: number } | null = null;

  for (const candidate of candidates) {
    const candidateTime = parseDiveDate(candidate.diveDate);
    if (incomingTime === null || candidateTime === null) continue;
    const secondsApart = Math.abs(incomingTime - candidateTime) / 1000;
    if (secondsApart > 300) continue;
    const candidateSerial = normalizeSerial(candidate.serialNumber);
    const sameSerial =
      Boolean(incomingSerial) &&
      Boolean(candidateSerial) &&
      incomingSerial === candidateSerial;
    const candidateDepth = nullableNumber(candidate.depth);
    const depthApart =
      incomingDepth === null || candidateDepth === null
        ? 0
        : Math.abs(incomingDepth - candidateDepth);

    if (!sameSerial && (secondsApart > 90 || depthApart > 1)) continue;
    if (sameSerial && depthApart > 3) continue;
    const score = (sameSerial ? 10_000 : 0) - secondsApart - depthApart * 20;
    if (!best || score > best.score) best = { id: candidate.id, score };
  }
  if (best) return best.id;

  // FIT/UDDF timestamps are commonly UTC while XML/database exports may store
  // local wall-clock time. Use a conservative profile fingerprint only when
  // one side is a portable exchange format and the best result is unambiguous.
  const mayNeedTimezoneFallback =
    incoming.source === "fit" ||
    incoming.source === "uddf" ||
    candidates.some((candidate) =>
      candidate.sources.some((source) => source === "fit" || source === "uddf"),
    );
  if (!mayNeedTimezoneFallback) return null;
  const incomingDuration = nullableNumber(incoming.durationSeconds);
  if (incomingDepth === null || incomingDuration === null) return null;
  const fingerprintMatches: Array<{ id: string; score: number }> = [];
  for (const candidate of candidates) {
    if (!sameOrAdjacentCalendarDay(incoming.diveDate, candidate.diveDate)) continue;
    const candidateDepth = nullableNumber(candidate.maxDepthM ?? candidate.depth);
    const candidateDuration = nullableNumber(candidate.durationSeconds);
    if (candidateDepth === null || candidateDuration === null) continue;
    const depthApart = Math.abs(incomingDepth - candidateDepth);
    const durationApart = Math.abs(incomingDuration - candidateDuration);
    if (depthApart > 0.75 || durationApart > 90) continue;
    const sameNumber =
      incoming.diveNumber !== null &&
      candidate.diveNumber !== null &&
      incoming.diveNumber === candidate.diveNumber;
    fingerprintMatches.push({
      id: candidate.id,
      score: depthApart * 100 + durationApart - (sameNumber ? 20 : 0),
    });
  }
  fingerprintMatches.sort((a, b) => a.score - b.score);
  if (
    fingerprintMatches.length > 1 &&
    fingerprintMatches[1].score - fingerprintMatches[0].score < 15
  ) {
    return null;
  }
  return fingerprintMatches[0]?.id ?? null;
}

function normalizeSerial(value: string | null) {
  return value?.replace(/[^a-z0-9]/gi, "").toUpperCase() || null;
}

function parseDiveDate(value: string | null) {
  if (!value) return null;
  const timestamp = new Date(value.replace(" ", "T")).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sameOrAdjacentCalendarDay(left: string | null, right: string | null) {
  if (!left || !right) return false;
  const leftDate = new Date(`${left.slice(0, 10)}T00:00:00Z`).getTime();
  const rightDate = new Date(`${right.slice(0, 10)}T00:00:00Z`).getTime();
  if (Number.isNaN(leftDate) || Number.isNaN(rightDate)) return false;
  return Math.abs(leftDate - rightDate) <= 86_400_000;
}
