import type { Bar } from "./market-data";

export type Sp500HistoryPayload = {
  source: string;
  symbol: string;
  label: string;
  fetchedAt: string;
  startDate: string;
  endDate: string;
  rangeLabel: string;
  bars: Bar[];
};

async function fetchJson(url: string, timeoutMs: number): Promise<Sp500HistoryPayload> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "default" });
    if (!res.ok) {
      throw new Error(`S&P 500 history unavailable (${res.status})`);
    }
    const data = (await res.json()) as Sp500HistoryPayload;
    if (!data?.bars?.length) {
      throw new Error("S&P 500 history file missing bars.");
    }
    return data;
  } finally {
    window.clearTimeout(timer);
  }
}

/** Long-run ^GSPC daily closes — static JSON from build, ~1928–present. */
export async function fetchSp500History(): Promise<Sp500HistoryPayload> {
  return fetchJson("/sp500-history.json", 12_000);
}
