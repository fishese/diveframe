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
  return best?.id ?? null;
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
