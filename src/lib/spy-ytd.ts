import type { Bar } from "./market-data";

export type SpyYtdStats = {
  year: number;
  first: number;
  last: number;
  changePct: number;
  high: number;
  low: number;
  sessions: number;
};

export function yearFromIso(iso: string): number {
  return Number(iso.slice(0, 4));
}

/** SPY daily closes from Jan 1 of `year` through the latest bar. */
export function ytdBarsFrom(bars: Bar[], year: number): Bar[] {
  const start = `${year}-01-01`;
  return bars.filter((b) => b.date >= start);
}

export function spyYtdStats(bars: Bar[], year: number): SpyYtdStats | null {
  const ytd = ytdBarsFrom(bars, year);
  if (ytd.length < 2) return null;
  const first = ytd[0].close;
  const last = ytd[ytd.length - 1].close;
  if (first <= 0) return null;
  const closes = ytd.map((b) => b.close);
  return {
    year,
    first,
    last,
    changePct: Math.round(((last - first) / first) * 10000) / 100,
    high: Math.max(...closes),
    low: Math.min(...closes),
    sessions: ytd.length,
  };
}

/** First trading day of each month for x-axis ticks. */
export function monthTicks(bars: Bar[]): { date: string; label: string; index: number }[] {
  const seen = new Set<string>();
  const ticks: { date: string; label: string; index: number }[] = [];
  for (let i = 0; i < bars.length; i++) {
    const month = bars[i].date.slice(5, 7);
    if (seen.has(month)) continue;
    seen.add(month);
    ticks.push({
      date: bars[i].date,
      label: new Intl.DateTimeFormat("en-US", { month: "short" }).format(
        new Date(`${bars[i].date}T12:00:00-04:00`),
      ),
      index: i,
    });
  }
  return ticks;
}
