export type SportsBulletin = {
  id: string;
  date: string;
  title: string;
  tagline: string | null;
  videoUrl: string | null;
  posterUrl: string | null;
  siteUrl: string;
  updatedAt: string | null;
};

/** Same-origin proxy → sportsin60.com/bulletins/latest.json */
export async function fetchSportsBulletin(): Promise<SportsBulletin> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch("/api/sports/bulletin", {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Bulletin unavailable (${res.status})`);
    }
    const data = (await res.json()) as SportsBulletin & { error?: string };
    if (!data?.id || !data?.date) {
      throw new Error(data.error || "Bulletin payload incomplete");
    }
    return data;
  } finally {
    window.clearTimeout(timer);
  }
}
