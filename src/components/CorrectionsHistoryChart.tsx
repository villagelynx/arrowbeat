import {
  type CorrectionHistory,
  type CorrectionEpisode,
  CORRECTION_THRESHOLD_PCT,
  CRASH_THRESHOLD_PCT,
  formatDurationDays,
  formatEpisodeRange,
} from "../lib/correction-history";

type Props = {
  history: CorrectionHistory;
  label: string;
  /** Dashboard embed vs dedicated page. */
  variant?: "page" | "teaser";
};

const W = 720;
const H_PRICE = 220;
const H_DD = 72;
const GAP = 12;
const PAD = { top: 14, right: 12, bottom: 28, left: 48 };
const INNER_W = W - PAD.left - PAD.right;

function pickYearTicks(dates: string[], max = 8): Array<{ index: number; label: string }> {
  if (dates.length < 2) return [];
  const firstYear = Number(dates[0].slice(0, 4));
  const lastYear = Number(dates[dates.length - 1].slice(0, 4));
  const span = lastYear - firstYear || 1;
  const step = Math.max(10, Math.ceil(span / max / 10) * 10);
  const out: Array<{ index: number; label: string }> = [];
  let y = Math.ceil(firstYear / step) * step;
  while (y <= lastYear) {
    const target = `${y}-06-15`;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < dates.length; i++) {
      const dist = Math.abs(dates[i].localeCompare(target));
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    if (!out.length || out[out.length - 1].index !== best) {
      out.push({ index: best, label: String(y) });
    }
    y += step;
  }
  return out;
}

function episodeRects(
  episodes: CorrectionEpisode[],
  dates: string[],
  xAt: (i: number) => number,
): Array<{ x: number; w: number; severity: "correction" | "crash"; key: string }> {
  const dateIndex = new Map(dates.map((d, i) => [d, i]));
  const rects: Array<{ x: number; w: number; severity: "correction" | "crash"; key: string }> = [];

  for (const ep of episodes) {
    const startIdx = dateIndex.get(ep.startDate);
    if (startIdx == null) continue;
    const endIdx = ep.endDate ? dateIndex.get(ep.endDate) : dates.length - 1;
    if (endIdx == null) continue;
    const x0 = xAt(startIdx);
    const x1 = xAt(endIdx);
    rects.push({
      x: x0,
      w: Math.max(1, x1 - x0),
      severity: ep.severity,
      key: ep.startDate,
    });
  }
  return rects;
}

export function CorrectionsHistoryChart({ history, label, variant = "page" }: Props) {
  const series = history.chartSeries;
  if (series.length < 2) {
    return <p className="corr-history__empty">Not enough index history for a correction chart yet.</p>;
  }

  const dates = series.map((p) => p.date);
  const closes = series.map((p) => p.close);
  const drawdowns = series.map((p) => p.drawdownPct);
  const n = series.length;

  const logMin = Math.log(Math.min(...closes));
  const logMax = Math.log(Math.max(...closes));
  const logSpan = logMax - logMin || 1;

  const ddMin = Math.min(-45, Math.min(...drawdowns) - 2);
  const ddMax = 4;
  const ddSpan = ddMax - ddMin || 1;

  const priceInnerH = variant === "teaser" ? 100 : H_PRICE - PAD.top - PAD.bottom;
  const ddInnerH = variant === "teaser" ? 0 : H_DD - 8;
  const totalH =
    variant === "teaser"
      ? PAD.top + priceInnerH + PAD.bottom
      : PAD.top + priceInnerH + GAP + ddInnerH + PAD.bottom;

  const xAt = (i: number) => PAD.left + (i / (n - 1)) * INNER_W;
  const yPrice = (close: number) =>
    PAD.top + priceInnerH - ((Math.log(close) - logMin) / logSpan) * priceInnerH;
  const yDd = (dd: number) => PAD.top + priceInnerH + GAP + ((ddMax - dd) / ddSpan) * ddInnerH;

  const linePts = series.map((p, i) => `${xAt(i).toFixed(1)},${yPrice(p.close).toFixed(1)}`);
  const linePath = `M ${linePts.join(" L ")}`;

  const ddPts = series.map((p, i) => `${xAt(i).toFixed(1)},${yDd(p.drawdownPct).toFixed(1)}`);
  const ddPath = `M ${ddPts.join(" L ")}`;
  const ddAreaPath = `${ddPath} L ${xAt(n - 1).toFixed(1)},${(PAD.top + priceInnerH + GAP + ddInnerH).toFixed(1)} L ${PAD.left},${(PAD.top + priceInnerH + GAP + ddInnerH).toFixed(1)} Z`;

  const ticks = pickYearTicks(dates);
  const shadeEpisodes = history.ongoing
    ? [...history.episodes, history.ongoing]
    : history.episodes;
  const shades = episodeRects(shadeEpisodes, dates, xAt);
  const showTable = variant === "page";
  const recentEpisodes = history.episodes.slice(0, 12);

  const corrLineY = yDd(-CORRECTION_THRESHOLD_PCT);
  const crashLineY = yDd(-CRASH_THRESHOLD_PCT);

  return (
    <div className={`corr-history${variant === "teaser" ? " corr-history--teaser" : ""}`}>
      <div className="corr-history__head">
        <div>
          <p className="corr-history__kicker">
            {label} · {history.rangeLabel} · rolling ~52-week peak
          </p>
          <p className="corr-history__statline">
            <strong>{history.totalEpisodes}</strong> corrections (≥{CORRECTION_THRESHOLD_PCT}%) ·{" "}
            <strong>{history.crashEpisodes}</strong> crashes / bear (≥{CRASH_THRESHOLD_PCT}%)
            {history.ongoing ? (
              <>
                {" "}
                · <span className="corr-history__ongoing">in correction now</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="corr-history__legend" aria-hidden="true">
          <span className="corr-history__swatch is-correction">≥10%</span>
          <span className="corr-history__swatch is-crash">≥20%</span>
        </div>
      </div>

      <svg
        className="corr-history__svg"
        viewBox={`0 0 ${W} ${totalH}`}
        role="img"
        aria-label={`${label} price and correction history, ${history.rangeLabel}`}
      >
        <defs>
          <linearGradient id="corr-dd-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--down)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--down)" stopOpacity="0.04" />
          </linearGradient>
        </defs>

        {ticks.map((t) => {
          const x = xAt(t.index);
          return (
            <line
              key={t.label}
              x1={x}
              x2={x}
              y1={PAD.top}
              y2={PAD.top + priceInnerH + (variant === "page" ? GAP + ddInnerH : 0)}
              className="corr-history__grid-v"
            />
          );
        })}

        {shades.map((r) => (
          <rect
            key={r.key}
            x={r.x}
            y={PAD.top}
            width={r.w}
            height={priceInnerH}
            className={
              r.severity === "crash" ? "corr-history__shade is-crash" : "corr-history__shade"
            }
          />
        ))}

        <path d={linePath} className="corr-history__price" fill="none" />

        {variant === "page" ? (
          <>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={corrLineY}
              y2={corrLineY}
              className="corr-history__threshold is-correction"
            />
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={crashLineY}
              y2={crashLineY}
              className="corr-history__threshold is-crash"
            />
            <path d={ddAreaPath} fill="url(#corr-dd-area)" />
            <path d={ddPath} className="corr-history__dd-line" fill="none" />
            <text x={PAD.left - 6} y={corrLineY + 3} className="corr-history__ylabel" textAnchor="end">
              −10%
            </text>
            <text x={PAD.left - 6} y={crashLineY + 3} className="corr-history__ylabel" textAnchor="end">
              −20%
            </text>
          </>
        ) : null}

        {ticks.map((t) => (
          <text
            key={`tick-${t.label}`}
            x={xAt(t.index)}
            y={totalH - 6}
            className="corr-history__tick"
            textAnchor="middle"
          >
            {t.label}
          </text>
        ))}
      </svg>

      {showTable ? (
        <>
          <p className="corr-history__note">
            Shaded bands mark sessions ≥10% below the rolling ~252-day high (same rule as correction
            odds). Darker bands reached ≥20% (crash / bear threshold). Top panel: log-scale index;
            bottom: drawdown depth from the rolling peak.
          </p>
          <div className="corr-history__table-wrap">
            <table className="corr-history__table">
              <caption className="corr-history__caption">
                Major drawdown episodes · newest first · {history.sampleDays.toLocaleString()} sessions
                in sample
              </caption>
              <thead>
                <tr>
                  <th scope="col">Period</th>
                  <th scope="col">Max depth</th>
                  <th scope="col">Decline</th>
                  <th scope="col">Recovery</th>
                  <th scope="col">Type</th>
                </tr>
              </thead>
              <tbody>
                {history.ongoing ? (
                  <tr className="is-ongoing">
                    <th scope="row">{formatEpisodeRange(history.ongoing)}</th>
                    <td>{history.ongoing.maxDepthPct.toFixed(1)}%</td>
                    <td>{formatDurationDays(history.ongoing.declineDays)}</td>
                    <td>ongoing</td>
                    <td>
                      {history.ongoing.severity === "crash" ? (
                        <span className="corr-history__tag is-crash">crash</span>
                      ) : (
                        <span className="corr-history__tag">correction</span>
                      )}
                    </td>
                  </tr>
                ) : null}
                {recentEpisodes.map((ep) =>
                  ep.endDate == null ? null : (
                    <tr key={ep.startDate} className={ep.severity === "crash" ? "is-crash" : undefined}>
                      <th scope="row">{formatEpisodeRange(ep)}</th>
                      <td>{ep.maxDepthPct.toFixed(1)}%</td>
                      <td>{formatDurationDays(ep.declineDays)}</td>
                      <td>{formatDurationDays(ep.recoveryDays)}</td>
                      <td>
                        {ep.severity === "crash" ? (
                          <span className="corr-history__tag is-crash">crash</span>
                        ) : (
                          <span className="corr-history__tag">correction</span>
                        )}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
          {history.episodes.length > recentEpisodes.length ? (
            <p className="corr-history__more">
              Showing {recentEpisodes.length} of {history.episodes.length} completed episodes in
              this sample.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
