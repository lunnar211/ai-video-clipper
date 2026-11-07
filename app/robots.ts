import type { MetadataRoute } from "next";

const base =
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://ai-video-clipper-dipeshkarki8292-3476s-projects.vercel.app";

/** robots.txt: everything crawlable, sitemap referenced. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${base}/sitemap.xml`,
  };
}
