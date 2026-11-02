import type { MetadataRoute } from "next";

const base =
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://ai-video-clipper-dipeshkarki8292-3476s-projects.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["", "/create", "/how-it-works", "/faq", "/pricing", "/publish", "/accounts", "/analytics", "/privacy", "/terms", "/contact", "/copyright", "/cookies", "/acceptable-use", "/report"];
  return pages.map((p) => ({
    url: `${base}${p}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: p === "" ? 1 : 0.7,
  }));
}
