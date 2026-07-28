export type UnitSystem = "metric" | "imperial";

export const metresToFeet = (metres: number) => metres * 3.280839895;
export const celsiusToFahrenheit = (celsius: number) => (celsius * 9) / 5 + 32;
export const barToPsi = (bar: number) => bar * 14.5037738;

export function formatDepthValue(
  metres: number,
  units: UnitSystem,
  decimals: number,
) {
  return units === "metric"
    ? `${metres.toFixed(decimals)} m`
    : `${metresToFeet(metres).toFixed(decimals)} ft`;
}

export function formatTemperatureValue(
  celsius: number,
  units: UnitSystem,
  decimals: number,
) {
  return units === "metric"
    ? `${celsius.toFixed(decimals)} °C`
    : `${celsiusToFahrenheit(celsius).toFixed(decimals)} °F`;
}

export function formatPressureValue(
  bar: number,
  units: UnitSystem,
  decimals: number,
) {
  return units === "metric"
    ? `${bar.toFixed(decimals)} bar`
    : `${barToPsi(bar).toFixed(decimals)} psi`;
}

export function parseUnitNumber(value: string | null | undefined) {
  if (!value) return null;
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : null;
}

export function parseDepthMetres(value: string | null | undefined) {
  const number = parseUnitNumber(value);
  if (number === null) return null;
  return /\bft\b/i.test(value ?? "") ? number / 3.280839895 : number;
}

export function parseTemperatureCelsius(value: string | null | undefined) {
  const number = parseUnitNumber(value);
  if (number === null) return null;
  return /\bF\b/i.test(value ?? "") ? ((number - 32) * 5) / 9 : number;
}

export function parsePressureBar(value: string | null | undefined) {
  const number = parseUnitNumber(value);
  if (number === null) return null;
  return /\bpsi\b/i.test(value ?? "") ? number / 14.5037738 : number;
}

export function parseDurationSeconds(value: string | null | undefined) {
  if (!value) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && !value.includes(":")) return numeric;
  const match = value.trim().match(/^(\d+):(\d+(?:\.\d+)?)\s*(?:min)?$/i);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = Math.floor(seconds % 60);
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
    : `${minutes}:${String(remaining).padStart(2, "0")}`;
}
