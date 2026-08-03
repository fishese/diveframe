/** ASCII comma, fullwidth comma, and ideographic comma (CJK enumeration). */
const BUDDY_SEPARATOR = /[,，、]/u;

export function splitBuddyNames(value: string | null | undefined): string[] {
  if (!value?.trim()) return [];
  return value
    .split(BUDDY_SEPARATOR)
    .map((name) => name.trim())
    .filter(Boolean);
}

export function collectBuddyNames(
  dives: Array<{ buddy?: string | null }>,
): string[] {
  const names = new Set<string>();
  for (const dive of dives) {
    for (const name of splitBuddyNames(dive.buddy)) {
      names.add(name);
    }
  }
  return [...names].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }),
  );
}

export function currentBuddyToken(value: string): {
  prefix: string;
  token: string;
  separator: string;
} {
  const match = value.match(/^(.*?)([,，、]\s*)([^,，、]*)$/u);
  if (!match) {
    return { prefix: "", token: value, separator: "" };
  }
  return {
    prefix: match[1],
    separator: match[2],
    token: match[3],
  };
}

export function matchBuddySuggestions(
  value: string,
  knownNames: string[],
  limit = 8,
): string[] {
  const { token } = currentBuddyToken(value);
  const needle = token.trim().toLocaleLowerCase();
  if (!needle) return [];
  // Exact match on the active token means the name is already complete.
  if (knownNames.some((name) => name.toLocaleLowerCase() === needle)) {
    return [];
  }

  const selected = new Set(
    splitBuddyNames(value).map((name) => name.toLocaleLowerCase()),
  );

  return knownNames
    .filter((name) => {
      const lower = name.toLocaleLowerCase();
      return lower.includes(needle) && !selected.has(lower);
    })
    .slice(0, limit);
}

export function completeBuddyToken(value: string, suggestion: string): string {
  const { prefix, separator } = currentBuddyToken(value);
  if (!separator && !prefix) {
    return suggestion;
  }
  return `${prefix}${separator}${suggestion}`;
}
