const LATEST_URL = "https://sportsin60.com/bulletins/latest.json";
export const SPORTS_IN_60_SITE = "https://sportsin60.com";

export type SportsBulletinPayload = {
  id: string;
  date: string;
  title: string;
  tagline: string | null;
  videoUrl: string | null;
  posterUrl: string | null;
  siteUrl: string;
  updatedAt: string | null;
};

function absoluteUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/")) return `${SPORTS_IN_60_SITE}${url}`;
  return null;
}

/** Pull the published daily bulletin pointer from sportsin60.com. */
export async function fetchLatestSportsBulletin(): Promise<SportsBulletinPayload> {
  const res = await fetch(LATEST_URL, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Bulletin fetch failed (${res.status})`);
  }
  const data = (await res.json()) as Record<string, unknown>;
  const id = typeof data.id === "string" ? data.id : null;
  const date = typeof data.date === "string" ? data.date : null;
  if (!id || !date) {
    throw new Error("Bulletin JSON missing id/date");
  }
  return {
    id,
    date,
    title: typeof data.title === "string" ? data.title : "Sports in 60",
    tagline: typeof data.tagline === "string" ? data.tagline : null,
    videoUrl: absoluteUrl(typeof data.videoUrl === "string" ? data.videoUrl : null),
    posterUrl: absoluteUrl(typeof data.posterUrl === "string" ? data.posterUrl : null),
    siteUrl: SPORTS_IN_60_SITE,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
  };
}
