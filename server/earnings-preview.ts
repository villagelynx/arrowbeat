import { MAG7_SYMBOLS } from "./market-snapshot.js";

export type EarningsTiming = "bmo" | "amc" | "unspecified";

export type EarningsReport = {
  symbol: string;
  name: string;
  date: string;
  timing: EarningsTiming;
  timingLabel: string;
  marketCap: number | null;
  marketCapLabel: string | null;
  epsForecast: string | null;
  fiscalQuarterEnding: string | null;
  lastYearEps: string | null;
  lastYearReportDate: string | null;
  isWatchlist: boolean;
};

export type EarningsDay = {
  date: string;
  label: string;
  weekday: string;
  reports: EarningsReport[];
};

export type EarningsPreviewPayload = {
  source: string;
  fetchedAt: string;
  asOfDate: string;
  horizonDays: number;
  delayNote: string;
  watchlist: EarningsReport[];
  days: EarningsDay[];
  totalReports: number;
};

const FETCH_MS = 3500;
const HORIZON_DAYS = 14;
const MAX_PER_DAY = 14;
const MIN_MARKET_CAP = 25_000_000_000; // $25B — keep the desk scannable
const WATCHLIST = new Set<string>([...MAG7_SYMBOLS, "GOOG"]);

const WATCHLIST_NAMES: Record<string, string> = {
  AAPL: "Apple",
  MSFT: "Microsoft",
  NVDA: "NVIDIA",
  AMZN: "Amazon",
  META: "Meta",
  GOOGL: "Alphabet",
  GOOG: "Alphabet",
  TSLA: "Tesla",
};

type NasdaqRow = {
  symbol?: string;
  name?: string;
  time?: string;
  marketCap?: string;
  epsForecast?: string;
  fiscalQuarterEnding?: string;
  lastYearEPS?: string;
  lastYearRptDt?: string;
  noOfEsts?: string;
};

type NasdaqPayload = {
  data?: {
    asOf?: string;
    rows?: NasdaqRow[] | null;
  };
};

function nyTodayIso(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function formatDayLabel(iso: string): { label: string; weekday: string } {
  const d = new Date(`${iso}T12:00:00-04:00`);
  return {
    weekday: new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
    }).format(d),
    label: new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "long",
      month: "short",
      day: "numeric",
    }).format(d),
  };
}

function parseMarketCap(raw?: string): number | null {
  if (!raw?.trim()) return null;
  const n = Number(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatMarketCap(n: number | null): string | null {
  if (n == null) return null;
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(0)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function mapTiming(raw?: string): { timing: EarningsTiming; timingLabel: string } {
  const t = (raw || "").toLowerCase();
  if (t.includes("pre")) return { timing: "bmo", timingLabel: "Before open" };
  if (t.includes("after") || t.includes("post")) {
    return { timing: "amc", timingLabel: "After close" };
  }
  return { timing: "unspecified", timingLabel: "Time TBA" };
}

function cleanText(value?: string): string | null {
  if (!value?.trim() || value.trim() === "N/A") return null;
  return value.trim();
}

async function fetchDay(date: string): Promise<NasdaqRow[]> {
  const url = `https://api.nasdaq.com/api/calendar/earnings?date=${encodeURIComponent(date)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 ArrowBeat/1.0",
        Origin: "https://www.nasdaq.com",
        Referer: "https://www.nasdaq.com/",
      },
    });
    if (!res.ok) throw new Error(`Nasdaq earnings HTTP ${res.status}`);
    const json = (await res.json()) as NasdaqPayload;
    return json.data?.rows ?? [];
  } finally {
    clearTimeout(timer);
  }
}

function toReport(date: string, row: NasdaqRow): EarningsReport | null {
  const symbol = row.symbol?.trim().toUpperCase();
  if (!symbol) return null;
  const marketCap = parseMarketCap(row.marketCap);
  const { timing, timingLabel } = mapTiming(row.time);
  const name = WATCHLIST_NAMES[symbol] || cleanText(row.name) || symbol;
  return {
    symbol,
    name,
    date,
    timing,
    timingLabel,
    marketCap,
    marketCapLabel: formatMarketCap(marketCap),
    epsForecast: cleanText(row.epsForecast),
    fiscalQuarterEnding: cleanText(row.fiscalQuarterEnding),
    lastYearEps: cleanText(row.lastYearEPS),
    lastYearReportDate: cleanText(row.lastYearRptDt),
    isWatchlist: WATCHLIST.has(symbol) || WATCHLIST.has(symbol.replace(/\./g, "")),
  };
}

function selectDayReports(reports: EarningsReport[]): EarningsReport[] {
  const watch = reports.filter((r) => r.isWatchlist);
  const rest = reports
    .filter((r) => !r.isWatchlist)
    .filter((r) => (r.marketCap ?? 0) >= MIN_MARKET_CAP)
    .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));

  const seen = new Set<string>();
  const out: EarningsReport[] = [];
  for (const row of [...watch, ...rest]) {
    if (seen.has(row.symbol)) continue;
    seen.add(row.symbol);
    out.push(row);
    if (out.length >= MAX_PER_DAY) break;
  }
  return out;
}

/**
 * Build a ~2-week earnings preview desk: Mag7 watchlist hits + large-cap prints.
 */
export async function buildEarningsPreview(
  horizonDays = HORIZON_DAYS,
): Promise<EarningsPreviewPayload> {
  const asOfDate = nyTodayIso();
  const dates = Array.from({ length: Math.max(1, Math.min(horizonDays, 21)) }, (_, i) =>
    addDaysIso(asOfDate, i),
  );

  const settled = await Promise.all(
    dates.map(async (date) => {
      try {
        const rows = await fetchDay(date);
        return { date, rows };
      } catch {
        return { date, rows: [] as NasdaqRow[] };
      }
    }),
  );

  const watchlist: EarningsReport[] = [];
  const days: EarningsDay[] = [];
  let totalReports = 0;

  for (const { date, rows } of settled) {
    const mapped = rows
      .map((row) => toReport(date, row))
      .filter((row): row is EarningsReport => row != null);
    totalReports += mapped.length;

    for (const row of mapped) {
      if (row.isWatchlist) watchlist.push(row);
    }

    const selected = selectDayReports(mapped);
    if (!selected.length) continue;
    const { label, weekday } = formatDayLabel(date);
    days.push({ date, label, weekday, reports: selected });
  }

  watchlist.sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol));

  return {
    source: "nasdaq-earnings-calendar",
    fetchedAt: new Date().toISOString(),
    asOfDate,
    horizonDays: dates.length,
    delayNote: "Nasdaq earnings calendar · consensus estimates when available",
    watchlist,
    days,
    totalReports,
  };
}
