export type OverlayFontId =
  | "noto-sans-hk"
  | "noto-sans-tc"
  | "noto-serif-tc"
  | "lxgw-wenkai-tc"
  | "system";

export type OverlayFontDefinition = {
  id: OverlayFontId;
  name: string;
  description: string;
  family: string;
  stack: string;
};

export const OVERLAY_FONTS: OverlayFontDefinition[] = [
  {
    id: "noto-sans-hk",
    name: "Noto Sans HK",
    description: "Clean Hong Kong Traditional Chinese",
    family: "Noto Sans HK",
    stack: '"Noto Sans HK", "PingFang HK", "Microsoft JhengHei", sans-serif',
  },
  {
    id: "noto-sans-tc",
    name: "Noto Sans TC",
    description: "Modern Traditional Chinese sans serif",
    family: "Noto Sans TC",
    stack: '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif',
  },
  {
    id: "noto-serif-tc",
    name: "Noto Serif TC",
    description: "Editorial Traditional Chinese serif",
    family: "Noto Serif TC",
    stack: '"Noto Serif TC", "Songti TC", "PMingLiU", serif',
  },
  {
    id: "lxgw-wenkai-tc",
    name: "LXGW WenKai TC",
    description: "Warm handwritten Traditional Chinese",
    family: "LXGW WenKai TC",
    stack: '"LXGW WenKai TC", "Kaiti TC", "DFKai-SB", cursive',
  },
  {
    id: "system",
    name: "Device Sans",
    description: "Fast device-default Latin and Chinese",
    family: "system-ui",
    stack: 'system-ui, "PingFang HK", "Microsoft JhengHei", sans-serif',
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
