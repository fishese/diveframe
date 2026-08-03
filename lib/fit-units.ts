/**
 * fit-file-parser 3.1.3 exposes dive-depth uint32 fields without applying the
 * FIT profile's 1000 scale, so the returned number is still millimetres.
 */
export function fitDepthMetres(value: unknown) {
  const number = finiteNumber(value);
  return number === null ? null : number / 1000;
}

/** Convert a FIT signed semicircle coordinate into bounded degrees. */
export function fitCoordinateDegrees(
  value: unknown,
  minimum: number,
  maximum: number,
) {
  const semicircles = finiteNumber(value);
  const degrees =
    semicircles === null ? null : semicircles * (180 / 2 ** 31);
  return degrees !== null && degrees >= minimum && degrees <= maximum
    ? degrees
    : null;
}

function finiteNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
