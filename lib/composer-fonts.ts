export type OverlayFontId =
  | "noto-sans-tc"
  | "inter"
  | "outfit"
  | "space-mono"
  | "huninn"
  | "system";

export type OverlayFontDefinition = {
  id: OverlayFontId;
  name: string;
  description: string;
  family: string;
  stack: string;
};

/**
 * Keep Noto Sans TC as the default bundled face for now (~APK still small).
 *
 * If we later drop Noto to shrink the install, prefer this EN/ZH-Hant/JA system
 * stack as the default (Latin-only lists like Roboto/Arial alone are not enough):
 *
 *   system-ui, -apple-system, "Segoe UI", "PingFang TC", "PingFang HK",
 *   "Hiragino Sans", "Yu Gothic UI", "Yu Gothic", "Microsoft JhengHei",
 *   "Noto Sans CJK TC", "Noto Sans TC", sans-serif
 */
export const SYSTEM_OVERLAY_FONT_STACK =
  'system-ui, -apple-system, "Segoe UI", "PingFang TC", "PingFang HK", "Hiragino Sans", "Yu Gothic UI", "Yu Gothic", "Microsoft JhengHei", "Noto Sans CJK TC", "Noto Sans TC", sans-serif';

export const OVERLAY_FONTS: OverlayFontDefinition[] = [
  {
    id: "noto-sans-tc",
    name: "Noto Sans TC",
    description: "Modern Traditional Chinese sans serif",
    family: "Noto Sans TC",
    stack: '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif',
  },
  {
    id: "inter",
    name: "Inter",
    description: "Crisp contemporary sans serif",
    family: "Inter",
    stack: '"Inter", "Noto Sans TC", system-ui, sans-serif',
  },
  {
    id: "outfit",
    name: "Outfit",
    description: "Geometric display sans serif",
    family: "Outfit",
    stack: '"Outfit", "Noto Sans TC", system-ui, sans-serif',
  },
  {
    id: "space-mono",
    name: "Space Mono",
    description: "Technical monospaced display face",
    family: "Space Mono",
    stack: '"Space Mono", "Noto Sans TC", monospace',
  },
  {
    id: "huninn",
    name: "Huninn",
    description: "Rounded Traditional Chinese and Latin",
    family: "Huninn",
    stack: '"Huninn", "Noto Sans TC", "PingFang TC", sans-serif',
  },
  {
    id: "system",
    name: "Device Sans",
    description: "Fast device-default Latin, Chinese, and Japanese",
    family: "system-ui",
    stack: SYSTEM_OVERLAY_FONT_STACK,
  },
];

export function getOverlayFont(id: OverlayFontId | null | undefined) {
  return OVERLAY_FONTS.find((font) => font.id === id) ?? OVERLAY_FONTS[0];
}

export async function ensureOverlayFont(
  id: OverlayFontId | null | undefined,
) {
  const font = getOverlayFont(id);
  if (font.id === "system" || typeof document === "undefined" || !document.fonts) {
    return;
  }
  try {
    await Promise.all(
      [400, 500, 600, 700].map((weight) =>
        document.fonts.load(`${weight} 48px "${font.family}"`),
      ),
    );
  } catch {
    // The declared stack remains usable when a remote font is unavailable.
  }
}
