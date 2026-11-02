import type { MetadataRoute } from "next";

const base =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://ai-video-clipper.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["", "/how-it-works", "/faq", "/pricing", "/privacy", "/terms", "/contact", "/copyright"];
  return pages.map((p) => ({
    url: `${base}${p}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: p === "" ? 1 : 0.7,
  }));
}
