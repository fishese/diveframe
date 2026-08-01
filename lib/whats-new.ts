import { diveFrameApiUrl } from "./diveframe-api";

export type WhatsNewLink = {
  label: string;
  href: string;
};

export type WhatsNewEntry = {
  id: string;
  title: string;
  body: string;
  date?: string;
  links: WhatsNewLink[];
};

export type WhatsNewDocument = {
  version: string;
  updatedAt: string;
  entries: WhatsNewEntry[];
};

export type WhatsNewBodyTextPart = {
  type: "text";
  text: string;
};

export type WhatsNewBodyLinkPart = {
  type: "link";
  label: string;
  href: string;
};

export type WhatsNewBodyPart = WhatsNewBodyTextPart | WhatsNewBodyLinkPart;

const INLINE_LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/g;

export function sanitizeWhatsNewHref(href: string): string | null {
  try {
    const url = new URL(href);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return href;
    }
    return null;
  } catch {
    return null;
  }
}

export function validateWhatsNewDocument(value: unknown): WhatsNewDocument {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid what's new document.");
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.version !== "string" ||
    !candidate.version.trim() ||
    typeof candidate.updatedAt !== "string" ||
    !candidate.updatedAt.trim() ||
    !Array.isArray(candidate.entries)
  ) {
    throw new Error("Invalid what's new document.");
  }

  return {
    version: candidate.version.trim(),
    updatedAt: candidate.updatedAt.trim(),
    entries: candidate.entries.map(validateWhatsNewEntry),
  };
}

function validateWhatsNewEntry(value: unknown): WhatsNewEntry {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid what's new entry.");
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.id !== "string" ||
    !candidate.id.trim() ||
    typeof candidate.title !== "string" ||
    !candidate.title.trim() ||
    typeof candidate.body !== "string"
  ) {
    throw new Error("Invalid what's new entry.");
  }

  const entry: WhatsNewEntry = {
    id: candidate.id.trim(),
    title: candidate.title.trim(),
    body: candidate.body,
    links: [],
  };

  if (candidate.date !== undefined) {
    if (typeof candidate.date !== "string") {
      throw new Error("Invalid what's new entry.");
    }
    entry.date = candidate.date;
  }

  if (candidate.links !== undefined) {
    if (!Array.isArray(candidate.links)) {
      throw new Error("Invalid what's new entry.");
    }
    entry.links = candidate.links
      .map(validateWhatsNewLink)
      .filter((link): link is WhatsNewLink => link !== null);
  }

  return entry;
}

function validateWhatsNewLink(value: unknown): WhatsNewLink | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.label !== "string" ||
    !candidate.label.trim() ||
    typeof candidate.href !== "string"
  ) {
    return null;
  }

  const href = sanitizeWhatsNewHref(candidate.href);
  if (!href) {
    return null;
  }

  return {
    label: candidate.label.trim(),
    href,
  };
}

export function renderWhatsNewBody(body: string): WhatsNewBodyPart[] {
  const parts: WhatsNewBodyPart[] = [];
  let lastIndex = 0;

  for (const match of body.matchAll(INLINE_LINK_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push({ type: "text", text: body.slice(lastIndex, index) });
    }

    const label = match[1];
    const href = sanitizeWhatsNewHref(match[2]);
    if (href) {
      parts.push({ type: "link", label, href });
    } else {
      parts.push({ type: "text", text: match[0] });
    }

    lastIndex = index + match[0].length;
  }

  if (lastIndex < body.length) {
    parts.push({ type: "text", text: body.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: "text", text: body }];
}

export async function fetchWhatsNewDocument(): Promise<WhatsNewDocument> {
  const response = await fetch(diveFrameApiUrl("/api/whats-new"));
  if (!response.ok) {
    throw new Error("What's new feed is unavailable.");
  }

  return validateWhatsNewDocument(await response.json());
}
