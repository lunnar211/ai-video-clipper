/**
 * Brand kit: logo, colors, fonts, watermark rules (client-side only).
 *
 * A brand kit lives in the browser (localStorage) until the Phase 1
 * database migration is applied; the server never sees the logo file
 * itself — the render pipeline draws it from an object URL. Watermark
 * rules: free renders always carry the site watermark; a brand kit
 * watermark is an additional brand mark, never a removal of the
 * free-tier mark.
 */

import { z } from "zod";

export const brandKitSchema = z.object({
  logoUrl: z.string().max(2048).optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#0ea5e9"),
  fontFamily: z.string().min(1).max(80).default("system-ui, sans-serif"),
  watermarkText: z.string().max(60).default(""),
  watermarkEnabled: z.boolean().default(false),
});

export type BrandKit = z.infer<typeof brandKitSchema>;

export const DEFAULT_BRAND_KIT: BrandKit = {
  primaryColor: "#0ea5e9",
  fontFamily: "system-ui, sans-serif",
  watermarkText: "",
  watermarkEnabled: false,
};

const STORAGE_KEY = "clipforge-brand-kit";

/** Parse + validate a brand kit payload. Returns null on bad input. */
export function parseBrandKit(raw: unknown): BrandKit | null {
  const result = brandKitSchema.safeParse(raw);
  return result.success ? result.data : null;
}

export function loadBrandKit(): BrandKit {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_BRAND_KIT };
    return parseBrandKit(JSON.parse(raw)) ?? { ...DEFAULT_BRAND_KIT };
  } catch {
    return { ...DEFAULT_BRAND_KIT };
  }
}

export function saveBrandKit(kit: BrandKit): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(kit));
  } catch {
    // Storage unavailable — the kit lives in memory only.
  }
}
