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
  error?: string;
};

export async function fetchEarningsPreview(): Promise<EarningsPreviewPayload> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch("/api/market/earnings", {
      signal: controller.signal,
      cache: "no-store",
    });
    const data = (await res.json()) as EarningsPreviewPayload;
    if (!res.ok) {
      throw new Error(data.error || `Earnings preview unavailable (${res.status})`);
    }
    return data;
  } finally {
    window.clearTimeout(timer);
  }
}

export function formatEarningsFetchedAt(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
