import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

type ChangeFrequency = NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;

const staticPages: { path: string; changeFrequency: ChangeFrequency; priority: number }[] = [
  { path: "", changeFrequency: "daily", priority: 1 },
  { path: "/surnames", changeFrequency: "daily", priority: 0.9 },
  { path: "/roots", changeFrequency: "weekly", priority: 0.8 },
  { path: "/search", changeFrequency: "weekly", priority: 0.7 },
  { path: "/community", changeFrequency: "daily", priority: 0.7 },
  { path: "/guide", changeFrequency: "monthly", priority: 0.5 },
  { path: "/families", changeFrequency: "weekly", priority: 0.6 },
  { path: "/login", changeFrequency: "monthly", priority: 0.3 },
  { path: "/register", changeFrequency: "monthly", priority: 0.3 },
  { path: "/legal/privacy", changeFrequency: "yearly", priority: 0.2 },
  { path: "/legal/terms", changeFrequency: "yearly", priority: 0.2 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return staticPages.map((p) => ({
    url: `${BASE}${p.path}`,
    lastModified: now,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
}
