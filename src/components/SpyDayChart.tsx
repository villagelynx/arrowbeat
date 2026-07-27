import type { IntradayBar } from "../lib/market-data";

type Props = {
  bars: IntradayBar[];
  prevClose?: number | null;
};

const W = 400;
const H = 168;
const PAD = { top: 12, right: 8, bottom: 26, left: 8 };
const INNER_W = W - PAD.left - PAD.right;
const INNER_H = H - PAD.top - PAD.bottom;

function pickTicks(bars: IntradayBar[]): Array<{ index: number; label: string }> {
  if (bars.length < 2) return [];
  const want = Math.min(4, bars.length);
  const step = (bars.length - 1) / (want - 1);
  const out: Array<{ index: number; label: string }> = [];
  for (let i = 0; i < want; i++) {
    const index = Math.round(i * step);
    out.push({ index, label: bars[index].label });
  }
  return out;
}

export function SpyDayChart({ bars, prevClose }: Props) {
  if (bars.length < 2) {
    return (
      <p className="spy-chart__empty">No intraday SPY bars yet for today.</p>
    );
  }

  const last = bars[bars.length - 1].close;
  const baseline =
    prevClose != null && Number.isFinite(prevClose) ? prevClose : bars[0].close;
  const changePct = ((last - baseline) / baseline) * 100;
  const up = changePct >= 0;

  const closes = bars.map((b) => b.close);
  if (prevClose != null && Number.isFinite(prevClose)) closes.push(prevClose);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;

  const xAt = (i: number) => PAD.left + (i / (bars.length - 1)) * INNER_W;
  const yAt = (price: number) => PAD.top + INNER_H - ((price - min) / span) * INNER_H;

  const linePts = bars.map((b, i) => `${xAt(i).toFixed(2)},${yAt(b.close).toFixed(2)}`);
  const linePath = `M ${linePts.join(" L ")}`;
  const areaPath = `${linePath} L ${xAt(bars.length - 1).toFixed(2)},${(PAD.top + INNER_H).toFixed(2)} L ${PAD.left},${(PAD.top + INNER_H).toFixed(2)} Z`;

  const ticks = pickTicks(bars);
  const sessionDate = bars[bars.length - 1].date;
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${sessionDate}T12:00:00-04:00`));

  return (
    <div className={`spy-chart ${up ? "is-up" : "is-down"}`}>
      <div className="spy-chart__head">
        <div>
          <p className="spy-chart__kicker">SPY · today · ~15m delayed</p>
          <p className="spy-chart__price">${last.toFixed(2)}</p>
        </div>
        <div className="spy-chart__chg">
          <p className={`spy-chart__pct ${up ? "is-up" : "is-down"}`}>
            {up ? "+" : ""}
            {changePct.toFixed(2)}%
          </p>
          <p className="spy-chart__sub">{dateLabel} · vs prior close</p>
        </div>
      </div>

      <svg
        className="spy-chart__svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`SPY intraday chart, ${changePct >= 0 ? "up" : "down"} ${Math.abs(changePct).toFixed(2)} percent`}
      >
        <defs>
          <linearGradient id="spy-day-area" x1="0" y1="0" x2="0" y2="1">
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

        {prevClose != null && Number.isFinite(prevClose) ? (
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={yAt(prevClose)}
            y2={yAt(prevClose)}
            className="spy-chart__prev"
          />
        ) : null}

        <path d={areaPath} fill="url(#spy-day-area)" />
        <path d={linePath} className="spy-chart__line" fill="none" />

        {ticks.map((t) => (
          <text
            key={`${t.index}-${t.label}`}
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
          Low <strong>${Math.min(...bars.map((b) => b.close)).toFixed(2)}</strong>
        </span>
        <span>
          High <strong>${Math.max(...bars.map((b) => b.close)).toFixed(2)}</strong>
        </span>
      </div>
    </div>
  );
}
