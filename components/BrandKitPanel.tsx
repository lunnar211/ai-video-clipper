"use client";

import type { BrandKit } from "@/lib/brandkit";

/**
 * Brand kit panel (ClipForge Phase 1). Colors, fonts and watermark
 * text persist in the browser; the logo file is session-only (object
 * URLs do not survive a reload — re-upload it each session, or host
 * it once the database migration is applied). The brand watermark is
 * an additional mark: it never removes the free-tier site watermark.
 */

const FONTS = [
  "system-ui, sans-serif",
  "Georgia, serif",
  "monospace",
  "Arial, sans-serif",
];

export default function BrandKitPanel(props: {
  kit: BrandKit;
  onChange: (kit: BrandKit) => void;
}) {
  const { kit, onChange } = props;
  return (
    <section className="space-y-3 rounded-xl bg-card p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Brand kit (optional)</h2>
      <p className="text-sm text-muted-foreground">
        Your logo, colors and fonts are drawn onto rendered clips. The
        logo stays in this browser session only; colors, fonts and
        watermark text are remembered on this device.
      </p>
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col">
          Logo (PNG with transparency works best)
          <input
            className="mt-1"
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              onChange({
                ...kit,
                logoUrl: f ? URL.createObjectURL(f) : undefined,
              });
            }}
          />
        </label>
        <label className="flex flex-col">
          Primary color
          <input
            className="mt-1 h-9 w-16 rounded border border-border"
            type="color"
            value={kit.primaryColor}
            onChange={(e) => onChange({ ...kit, primaryColor: e.target.value })}
          />
        </label>
        <label className="flex flex-col">
          Caption font
          <select
            className="mt-1 rounded border border-border px-2 py-1"
            value={kit.fontFamily}
            onChange={(e) => onChange({ ...kit, fontFamily: e.target.value })}
          >
            {FONTS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          Watermark text (your brand, optional)
          <input
            className="mt-1 rounded border border-border px-2 py-1"
            value={kit.watermarkText}
            onChange={(e) => onChange({ ...kit, watermarkText: e.target.value })}
          />
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={kit.watermarkEnabled}
            onChange={(e) =>
              onChange({ ...kit, watermarkEnabled: e.target.checked })
            }
          />
          Show my brand watermark
        </label>
      </div>
    </section>
  );
}
