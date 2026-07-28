import type { DiveCategory } from "../dive-model";

export function parseGpsPair(value: string | null | undefined) {
  if (!value) return null;
  const numbers = value
    .replace(",", " ")
    .trim()
    .split(/\s+/)
    .map(Number);
  if (
    numbers.length < 2 ||
    !Number.isFinite(numbers[0]) ||
    !Number.isFinite(numbers[1])
  ) {
    return null;
  }
  return { latitude: numbers[0], longitude: numbers[1] };
}

export function safeJson(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function numberFrom(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  return null;
}

export function inferCategory(value: string | null | undefined): {
  category: DiveCategory;
  source: "default" | "import";
} {
  const normalized = value?.toLocaleLowerCase("en") ?? "";
  if (normalized.includes("free")) {
    return { category: "freediving", source: "import" };
  }
  if (normalized.includes("snork")) {
    return { category: "snorkelling", source: "import" };
  }
  return { category: "scuba", source: "default" };
}
