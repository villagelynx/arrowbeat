/**
 * Yahoo headlines + same/next-session price co-movement for desk symbols.
 * Educational co-movement only — not causal attribution.
 */

import {
  barsFromChart,
  sanitizeTicker,
  softYahoo,
  type Bar,
} from "./market-snapshot.js";

export type NewsImpactItem = {
  id: string;
  title: string;
  publisher: string;
  link: string;
  /** ISO timestamp from Yahoo when available. */
  publishedAt: string;
  /** America/New_York calendar date of the headline. */
  publishDate: string;
  /** Trading session used for same-session % (may be next open after late news). */
  eventDate: string | null;
  /** Close vs prior session on eventDate. */
  sameSessionPct: number | null;
  /** Next session close vs eventDate close. */
  nextSessionPct: number | null;
  /** Close 3 sessions later vs eventDate close (when history allows). */
  window3Pct: number | null;
};

export type NewsPricePayload = {
  symbol: string;
  fetchedAt: string;
  source: string;
  delayNote: string;
  items: NewsImpactItem[];
  disclaimer: string;
  error?: string;
};

type YahooNewsStory = {
  uuid?: string;
  title?: string;
  publisher?: string;
  link?: string;
  providerPublishTime?: number;
  type?: string;
};

type YahooSearch = {
  news?: YahooNewsStory[];
};

const FETCH_MS = 3200;

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 ArrowBeat/1.0",
        Accept: "application/json",
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchYahooNews(symbol: string, count: number): Promise<YahooNewsStory[]> {
  const hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
  const attempts = hosts.map(async (host) => {
    const url = new URL(`https://${host}/v1/finance/search`);
    url.searchParams.set("q", symbol);
    url.searchParams.set("quotesCount", "0");
    url.searchParams.set("newsCount", String(count));
    url.searchParams.set("listsCount", "0");
    const res = await fetchWithTimeout(url.toString());
    if (!res.ok) throw new Error(`Yahoo news HTTP ${res.status}`);
    const data = (await res.json()) as YahooSearch;
    return Array.isArray(data.news) ? data.news : [];
  });
  try {
    return await Promise.any(attempts);
  } catch {
    return [];
  }
}

function nyParts(tsSec: number): { date: string; hour: number } {
  const d = new Date(tsSec * 1000);
  const date = d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const hourStr = d.toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    hour12: false,
  });
  const hour = Number(hourStr);
  return { date, hour: Number.isFinite(hour) ? hour : 12 };
}

function roundPct(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Map a headline clock time to the session whose open–close is used for "same session".
 * After ~16:00 America/New_York, the same-session print is still that day (if a bar exists);
 * "next session" is the following bar when history has it.
 */
function resolveSessionIndices(
  bars: Bar[],
  publishDate: string,
  publishHour: number,
): { sameIdx: number; nextIdx: number } {
  if (!bars.length) return { sameIdx: -1, nextIdx: -1 };

  let sameIdx = bars.findIndex((b) => b.date === publishDate);
  if (sameIdx < 0) {
    // Weekend / holiday: first session after the publish calendar day.
    sameIdx = bars.findIndex((b) => b.date > publishDate);
  }

  // Late-day / after-close news: co-locate same-session with the completed day when present,
  // and point "next" at the following session (may be unavailable until markets reopen).
  if (sameIdx >= 0) {
    const afterClose = publishHour >= 16;
    const nextIdx = afterClose
      ? sameIdx + 1 < bars.length
        ? sameIdx + 1
        : -1
      : sameIdx + 1 < bars.length
        ? sameIdx + 1
        : -1;
    return { sameIdx, nextIdx };
  }

  // News is newer than the tip of history (e.g. today's story before Yahoo posts the bar).
  return { sameIdx: -1, nextIdx: -1 };
}

function impactAtIndex(
  bars: Bar[],
  sameIdx: number,
  nextIdx: number,
): {
  eventDate: string;
  sameSessionPct: number | null;
  nextSessionPct: number | null;
  window3Pct: number | null;
} | null {
  if (sameIdx < 0 || sameIdx >= bars.length) return null;
  const cur = bars[sameIdx].close;
  if (!Number.isFinite(cur) || cur <= 0) return null;

  let sameSessionPct: number | null = null;
  if (sameIdx > 0) {
    const prev = bars[sameIdx - 1].close;
    if (Number.isFinite(prev) && prev > 0) {
      sameSessionPct = roundPct(((cur - prev) / prev) * 100);
    }
  }

  let nextSessionPct: number | null = null;
  if (nextIdx >= 0 && nextIdx < bars.length) {
    const next = bars[nextIdx].close;
    if (Number.isFinite(next) && next > 0) {
      nextSessionPct = roundPct(((next - cur) / cur) * 100);
    }
  }

  let window3Pct: number | null = null;
  if (sameIdx + 3 < bars.length) {
    const later = bars[sameIdx + 3].close;
    if (Number.isFinite(later) && later > 0) {
      window3Pct = roundPct(((later - cur) / cur) * 100);
    }
  }

  return {
    eventDate: bars[sameIdx].date,
    sameSessionPct,
    nextSessionPct,
    window3Pct,
  };
}

/**
 * Build Yahoo headlines for `symbol` with daily-close co-movement from ~1y bars.
 */
export async function buildNewsPriceImpact(rawSymbol: string): Promise<NewsPricePayload> {
  const symbol = sanitizeTicker(rawSymbol);
  if (!symbol || !/^[A-Z0-9.^*=-]{1,16}$/.test(symbol)) {
    throw new Error("Enter a valid ticker (letters, numbers, . ^ = -).");
  }

  const disclaimer =
    "Headlines are co-located with session closes for education only — not causal proof, not advice. Yahoo free delayed data; archive may be shallow.";

  const [stories, chart] = await Promise.all([
    fetchYahooNews(symbol, 12),
    softYahoo(symbol, "1y"),
  ]);
  const bars = barsFromChart(chart);

  const seen = new Set<string>();
  const items: NewsImpactItem[] = [];

  for (const story of stories) {
    const title = (story.title ?? "").trim();
    if (!title) continue;
    const id = story.uuid || `${title.slice(0, 48)}-${story.providerPublishTime ?? ""}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const ts = story.providerPublishTime;
    if (ts == null || !Number.isFinite(ts) || ts <= 0) continue;

    const { date: publishDate, hour } = nyParts(ts);
    const { sameIdx, nextIdx } = resolveSessionIndices(bars, publishDate, hour);
    const impact = impactAtIndex(bars, sameIdx, nextIdx);

    items.push({
      id,
      title,
      publisher: (story.publisher ?? "Yahoo Finance").trim() || "Yahoo Finance",
      link: (story.link ?? "").trim(),
      publishedAt: new Date(ts * 1000).toISOString(),
      publishDate,
      eventDate: impact?.eventDate ?? null,
      sameSessionPct: impact?.sameSessionPct ?? null,
      nextSessionPct: impact?.nextSessionPct ?? null,
      window3Pct: impact?.window3Pct ?? null,
    });

    if (items.length >= 10) break;
  }

  return {
    symbol,
    fetchedAt: new Date().toISOString(),
    source: "yahoo-finance",
    delayNote: "~15m delayed quotes · free Yahoo headlines",
    items,
    disclaimer,
    ...(items.length === 0 && bars.length === 0
      ? { error: "No news or history returned for this symbol." }
      : items.length === 0
        ? { error: "No recent headlines returned for this symbol." }
        : {}),
  };
}
