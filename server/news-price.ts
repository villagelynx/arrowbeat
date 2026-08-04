/**
 * Yahoo headlines (+ short ledes) joined to same/next-session price co-movement.
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
  /** Short story lede / first-paragraph teaser when Yahoo provides one. */
  summary: string | null;
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
  summary?: string | null;
  providerPublishTime?: number;
};

type YahooSearch = {
  news?: Array<{
    uuid?: string;
    title?: string;
    publisher?: string;
    link?: string;
    providerPublishTime?: number;
  }>;
};

const FETCH_MS = 3200;
const SUMMARY_MAX = 320;

async function fetchWithTimeout(
  url: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 ArrowBeat/1.0",
        Accept: "application/json",
        ...headers,
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

function decodeXml(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function stripTags(html: string): string {
  return decodeXml(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Clip to about the first paragraph / 320 chars without cutting mid-word. */
export function clipSummary(raw: string, max = SUMMARY_MAX): string {
  let t = stripTags(raw);
  if (!t) return "";
  // Prefer first 1–2 sentences when short enough.
  const sentences = t.match(/[^.!?]+[.!?]+(\s+|$)/g);
  if (sentences?.length) {
    let built = "";
    for (const s of sentences) {
      const next = (built + s).trim();
      if (next.length > max) break;
      built = next;
      if (built.length >= 80) break;
    }
    if (built.length >= 40) t = built;
  }
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > 80 ? cut.slice(0, sp) : cut).trim()}…`;
}

function parseRssItems(xml: string): YahooNewsStory[] {
  const items: YahooNewsStory[] = [];
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];
  for (const block of blocks) {
    const title = stripTags((block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim());
    if (!title) continue;
    const linkRaw = (block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? "").trim();
    const link = decodeXml(linkRaw).replace(/\?\.tsrc=rss$/i, "").replace(/\?\.tsrc=rss&/i, "?");
    const guid = stripTags(block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i)?.[1] ?? "");
    const description = block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] ?? "";
    const pubDate = stripTags(block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ?? "");
    const ts = pubDate ? Date.parse(pubDate) : NaN;
    const summary = clipSummary(description);
    items.push({
      uuid: guid || undefined,
      title,
      link: link || undefined,
      publisher: "Yahoo Finance",
      summary: summary || null,
      providerPublishTime: Number.isFinite(ts) ? Math.floor(ts / 1000) : undefined,
    });
  }
  return items;
}

/** RSS carries title + lede/description for many symbols (best free teaser source). */
async function fetchYahooRssNews(symbol: string): Promise<YahooNewsStory[]> {
  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`;
  try {
    const res = await fetchWithTimeout(url, {
      Accept: "application/rss+xml, application/xml, text/xml, */*",
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRssItems(xml);
  } catch {
    return [];
  }
}

/** JSON search fallback (often no summary) + publisher when RSS is missing. */
async function fetchYahooSearchNews(symbol: string, count: number): Promise<YahooNewsStory[]> {
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
    return (Array.isArray(data.news) ? data.news : []).map((n) => ({
      uuid: n.uuid,
      title: n.title,
      publisher: n.publisher,
      link: n.link,
      summary: null as string | null,
      providerPublishTime: n.providerPublishTime,
    }));
  });
  try {
    return await Promise.any(attempts);
  } catch {
    return [];
  }
}

/** Soft og:description when RSS lede is empty (Yahoo article pages). */
async function softFetchArticleLede(link: string): Promise<string | null> {
  if (!link || !/finance\.yahoo\.com/i.test(link)) return null;
  try {
    const res = await fetchWithTimeout(link, {
      Accept: "text/html,application/xhtml+xml",
    });
    if (!res.ok) return null;
    const html = await res.text();
    const patterns = [
      /property="og:description"\s+content="([^"]+)"/i,
      /content="([^"]+)"\s+property="og:description"/i,
      /name="description"\s+content="([^"]+)"/i,
      /content="([^"]+)"\s+name="description"/i,
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m?.[1]) {
        const clipped = clipSummary(m[1]);
        if (clipped.length >= 20) return clipped;
      }
    }
  } catch {
    // soft-fail
  }
  return null;
}

function mergeStories(rss: YahooNewsStory[], search: YahooNewsStory[]): YahooNewsStory[] {
  const byId = new Map<string, YahooNewsStory>();
  const keyOf = (s: YahooNewsStory) =>
    s.uuid || `${(s.title ?? "").slice(0, 48)}-${s.providerPublishTime ?? ""}`;

  for (const s of rss) {
    if (!s.title) continue;
    byId.set(keyOf(s), { ...s });
  }
  for (const s of search) {
    if (!s.title) continue;
    const k = keyOf(s);
    const prev = byId.get(k);
    if (!prev) {
      byId.set(k, { ...s });
      continue;
    }
    byId.set(k, {
      ...prev,
      publisher: prev.publisher && prev.publisher !== "Yahoo Finance" ? prev.publisher : s.publisher || prev.publisher,
      link: prev.link || s.link,
      summary: prev.summary || s.summary || null,
      providerPublishTime: prev.providerPublishTime ?? s.providerPublishTime,
      uuid: prev.uuid || s.uuid,
    });
  }
  // Prefer RSS order, then remaining search items.
  const ordered: YahooNewsStory[] = [];
  const seen = new Set<string>();
  for (const s of [...rss, ...search]) {
    if (!s.title) continue;
    const k = keyOf(s);
    if (seen.has(k)) continue;
    seen.add(k);
    const merged = byId.get(k);
    if (merged) ordered.push(merged);
  }
  return ordered;
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
  _publishHour: number,
): { sameIdx: number; nextIdx: number } {
  if (!bars.length) return { sameIdx: -1, nextIdx: -1 };

  let sameIdx = bars.findIndex((b) => b.date === publishDate);
  if (sameIdx < 0) {
    sameIdx = bars.findIndex((b) => b.date > publishDate);
  }

  if (sameIdx >= 0) {
    const nextIdx = sameIdx + 1 < bars.length ? sameIdx + 1 : -1;
    return { sameIdx, nextIdx };
  }

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
    "Headlines and short ledes are co-located with session closes for education only — not causal proof, not advice. Yahoo free delayed data; ledes are teasers (not the full article).";

  const [rss, search, chart] = await Promise.all([
    fetchYahooRssNews(symbol),
    fetchYahooSearchNews(symbol, 12),
    softYahoo(symbol, "1y"),
  ]);
  const bars = barsFromChart(chart);
  let stories = mergeStories(rss, search).slice(0, 10);

  // Soft-fill missing ledes for the first few stories (keeps wall-clock small).
  const needLede = stories
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => !s.summary && s.link)
    .slice(0, 4);
  if (needLede.length) {
    const ledes = await Promise.all(needLede.map(({ s }) => softFetchArticleLede(s.link!)));
    stories = stories.map((s, i) => {
      const j = needLede.findIndex((x) => x.i === i);
      if (j < 0 || !ledes[j]) return s;
      return { ...s, summary: ledes[j] };
    });
  }

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
    const summary = story.summary ? clipSummary(story.summary) : null;

    items.push({
      id,
      title,
      publisher: (story.publisher ?? "Yahoo Finance").trim() || "Yahoo Finance",
      link: (story.link ?? "").trim(),
      summary: summary && summary.length >= 12 ? summary : null,
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
    delayNote: "~15m delayed quotes · free Yahoo headlines + teaser ledes",
    items,
    disclaimer,
    ...(items.length === 0 && bars.length === 0
      ? { error: "No news or history returned for this symbol." }
      : items.length === 0
        ? { error: "No recent headlines returned for this symbol." }
        : {}),
  };
}
