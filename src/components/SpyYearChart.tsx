import type { Bar } from "../lib/market-data";
import { monthTicks, spyYtdStats, ytdBarsFrom } from "../lib/spy-ytd";

type Props = {
  bars: Bar[];
  year: number;
};

const W = 400;
const H = 168;
const PAD = { top: 12, right: 8, bottom: 26, left: 8 };
const INNER_W = W - PAD.left - PAD.right;
const INNER_H = H - PAD.top - PAD.bottom;

export function SpyYearChart({ bars, year }: Props) {
  const stats = spyYtdStats(bars, year);
  if (!stats) {
    return (
      <p className="spy-chart__empty">Not enough SPY history for a {year} chart yet.</p>
    );
  }

  const ytdBars = ytdBarsFrom(bars, year);
  const closes = ytdBars.map((b) => b.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;

  const xAt = (i: number) => PAD.left + (i / (ytdBars.length - 1)) * INNER_W;
  const yAt = (price: number) => PAD.top + INNER_H - ((price - min) / span) * INNER_H;

  const linePts = ytdBars.map((b, i) => `${xAt(i).toFixed(2)},${yAt(b.close).toFixed(2)}`);
  const linePath = `M ${linePts.join(" L ")}`;
  const areaPath = `${linePath} L ${xAt(ytdBars.length - 1).toFixed(2)},${(PAD.top + INNER_H).toFixed(2)} L ${PAD.left},${(PAD.top + INNER_H).toFixed(2)} Z`;

  const up = stats.changePct >= 0;
  const ticks = monthTicks(ytdBars);

  return (
    <div className={`spy-chart ${up ? "is-up" : "is-down"}`}>
      <div className="spy-chart__head">
        <div>
          <p className="spy-chart__kicker">SPY · {year} YTD</p>
          <p className="spy-chart__price">${stats.last.toFixed(2)}</p>
        </div>
        <div className="spy-chart__chg">
          <p className={`spy-chart__pct ${up ? "is-up" : "is-down"}`}>
            {up ? "+" : ""}
            {stats.changePct.toFixed(2)}%
          </p>
          <p className="spy-chart__sub">{stats.sessions} sessions</p>
        </div>
      </div>

      <svg
        className="spy-chart__svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`SPY year-to-date chart ${year}, ${stats.changePct >= 0 ? "up" : "down"} ${Math.abs(stats.changePct).toFixed(2)} percent`}
      >
        <defs>
          <linearGradient id="spy-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={up ? "var(--up)" : "var(--down)"} stopOpacity="0.35" />
            <stop offset="100%" stopColor={up ? "var(--up)" : "var(--down)"} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75].map((t) => {
          const y = PAD.top + INNER_H * t;
          return (
            <line
              key={t}
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y}
              y2={y}
              className="spy-chart__grid"
            />
          );
        })}

        <path d={areaPath} fill="url(#spy-area)" />
        <path d={linePath} className="spy-chart__line" fill="none" />

        {ticks.map((t) => (
          <text
            key={t.date}
            x={xAt(t.index)}
            y={H - 6}
            className="spy-chart__tick"
            textAnchor="middle"
          >
            {t.label}
          </text>
        ))}
      </svg>

      <div className="spy-chart__range">
        <span>
          Low <strong>${stats.low.toFixed(2)}</strong>
        </span>
        <span>
          High <strong>${stats.high.toFixed(2)}</strong>
        </span>
      </div>
    </div>
  );
}
