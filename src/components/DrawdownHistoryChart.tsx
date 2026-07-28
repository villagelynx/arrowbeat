import {
  type CorrectionHistory,
  type CorrectionEpisode,
  CORRECTION_THRESHOLD_PCT,
  CRASH_THRESHOLD_PCT,
  formatDurationDays,
  formatEpisodeRange,
} from "../lib/correction-history";

export type DrawdownHistoryMode = "correction" | "crash";

type Props = {
  history: CorrectionHistory;
  label: string;
  /** Dashboard embed vs dedicated page. */
  variant?: "page" | "teaser";
  mode?: DrawdownHistoryMode;
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
  crashOnly: boolean,
): Array<{ x: number; w: number; severity: "correction" | "crash"; key: string }> {
  const dateIndex = new Map(dates.map((d, i) => [d, i]));
  const rects: Array<{ x: number; w: number; severity: "correction" | "crash"; key: string }> = [];

  for (const ep of episodes) {
    if (crashOnly && ep.severity !== "crash") continue;
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

function crashEpisodes(history: CorrectionHistory): CorrectionEpisode[] {
  return history.episodes.filter((e) => e.severity === "crash");
}

export function DrawdownHistoryChart({
  history,
  label,
  variant = "page",
  mode = "correction",
}: Props) {
  const isCrash = mode === "crash";
  const series = history.chartSeries;
  if (series.length < 2) {
    return (
      <p className="corr-history__empty">
        Not enough index history for a {isCrash ? "crash" : "correction"} chart yet.
      </p>
    );
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
  const ddBottomY = PAD.top + priceInnerH + GAP + ddInnerH;
  const ddAreaPath = `${ddPath} L ${xAt(n - 1).toFixed(1)},${ddBottomY.toFixed(1)} L ${PAD.left},${ddBottomY.toFixed(1)} Z`;

  const ddCrashPts = series.map((p, i) => {
    const y =
      p.drawdownPct <= -CRASH_THRESHOLD_PCT
        ? yDd(p.drawdownPct)
        : yDd(-CRASH_THRESHOLD_PCT);
    return `${xAt(i).toFixed(1)},${y.toFixed(1)}`;
  });
  const ddCrashPath = `M ${ddCrashPts.join(" L ")}`;
  const crashThresholdY = yDd(-CRASH_THRESHOLD_PCT);
  const ddCrashAreaPath = `${ddCrashPath} L ${xAt(n - 1).toFixed(1)},${crashThresholdY.toFixed(1)} L ${PAD.left},${crashThresholdY.toFixed(1)} Z`;

  const ticks = pickYearTicks(dates);
  const allEpisodes = history.ongoing
    ? [...history.episodes, history.ongoing]
    : history.episodes;
  const shades = episodeRects(allEpisodes, dates, xAt, isCrash);
  const showTable = variant === "page";
  const tableEpisodes = isCrash ? crashEpisodes(history) : history.episodes;
  const recentEpisodes = tableEpisodes.slice(0, 12);
  const ongoingCrash =
    history.ongoing?.severity === "crash" ? history.ongoing : null;

  const corrLineY = yDd(-CORRECTION_THRESHOLD_PCT);
  const crashLineY = yDd(-CRASH_THRESHOLD_PCT);

  const ariaLabel = isCrash
    ? `${label} price and crash history, ${history.rangeLabel}`
    : `${label} price and correction history, ${history.rangeLabel}`;

  return (
    <div
      className={`corr-history${variant === "teaser" ? " corr-history--teaser" : ""}${isCrash ? " corr-history--crash" : ""}`}
    >
      <div className="corr-history__head">
        <div>
          <p className="corr-history__kicker">
            {label} · {history.rangeLabel} · rolling ~52-week peak
          </p>
          <p className="corr-history__statline">
            {isCrash ? (
              <>
                <strong>{history.crashEpisodes}</strong> crashes / bear markets (≥
                {CRASH_THRESHOLD_PCT}%)
                {ongoingCrash ? (
                  <>
                    {" "}
                    · <span className="corr-history__ongoing">in crash territory now</span>
                  </>
                ) : null}
              </>
            ) : (
              <>
                <strong>{history.totalEpisodes}</strong> corrections (≥{CORRECTION_THRESHOLD_PCT}
                %) · <strong>{history.crashEpisodes}</strong> crashes / bear (≥
                {CRASH_THRESHOLD_PCT}%)
                {history.ongoing ? (
                  <>
                    {" "}
                    · <span className="corr-history__ongoing">in correction now</span>
                  </>
                ) : null}
              </>
            )}
          </p>
        </div>
        <div className="corr-history__legend" aria-hidden="true">
          {isCrash ? (
            <span className="corr-history__swatch is-crash">≥20% crash / bear</span>
          ) : (
            <>
              <span className="corr-history__swatch is-correction">≥10%</span>
              <span className="corr-history__swatch is-crash">≥20%</span>
            </>
          )}
        </div>
      </div>

      <svg className="corr-history__svg" viewBox={`0 0 ${W} ${totalH}`} role="img" aria-label={ariaLabel}>
        <defs>
          <linearGradient id="corr-dd-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--down)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--down)" stopOpacity="0.04" />
          </linearGradient>
          <linearGradient id="crash-dd-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--down)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--down)" stopOpacity="0.12" />
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
              isCrash || r.severity === "crash"
                ? "corr-history__shade is-crash"
                : "corr-history__shade"
            }
          />
        ))}

        <path d={linePath} className="corr-history__price" fill="none" />

        {variant === "page" ? (
          <>
            {!isCrash ? (
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={corrLineY}
                y2={corrLineY}
                className="corr-history__threshold is-correction"
              />
            ) : null}
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={crashLineY}
              y2={crashLineY}
              className="corr-history__threshold is-crash"
            />
            {isCrash ? (
              <path d={ddCrashAreaPath} fill="url(#crash-dd-area)" />
            ) : (
              <path d={ddAreaPath} fill="url(#corr-dd-area)" />
            )}
            <path d={ddPath} className="corr-history__dd-line" fill="none" />
            {!isCrash ? (
              <text x={PAD.left - 6} y={corrLineY + 3} className="corr-history__ylabel" textAnchor="end">
                −10%
              </text>
            ) : null}
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
            {isCrash ? (
              <>
                Shaded bands mark crash / bear episodes that reached ≥20% below the rolling ~252-day
                high (same rule as crash odds). Top panel: log-scale index; bottom: drawdown depth
                with fill below the −20% threshold.
              </>
            ) : (
              <>
                Shaded bands mark sessions ≥10% below the rolling ~252-day high (same rule as
                correction odds). Darker bands reached ≥20% (crash / bear threshold). Top panel:
                log-scale index; bottom: drawdown depth from the rolling peak.
              </>
            )}
          </p>
          <div className="corr-history__table-wrap">
            <table className="corr-history__table">
              <caption className="corr-history__caption">
                {isCrash ? "Crash / bear episodes" : "Major drawdown episodes"} · newest first ·{" "}
                {history.sampleDays.toLocaleString()} sessions in sample
              </caption>
              <thead>
                <tr>
                  <th scope="col">Period</th>
                  <th scope="col">Max depth</th>
                  <th scope="col">Decline</th>
                  <th scope="col">Recovery</th>
                  {!isCrash ? <th scope="col">Type</th> : null}
                </tr>
              </thead>
              <tbody>
                {isCrash && ongoingCrash ? (
                  <tr className="is-ongoing is-crash">
                    <th scope="row">{formatEpisodeRange(ongoingCrash)}</th>
                    <td>{ongoingCrash.maxDepthPct.toFixed(1)}%</td>
                    <td>{formatDurationDays(ongoingCrash.declineDays)}</td>
                    <td>ongoing</td>
                  </tr>
                ) : null}
                {!isCrash && history.ongoing ? (
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
                      {!isCrash ? (
                        <td>
                          {ep.severity === "crash" ? (
                            <span className="corr-history__tag is-crash">crash</span>
                          ) : (
                            <span className="corr-history__tag">correction</span>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
          {tableEpisodes.length > recentEpisodes.length ? (
            <p className="corr-history__more">
              Showing {recentEpisodes.length} of {tableEpisodes.length}{" "}
              {isCrash ? "crash" : "completed"} episodes in this sample.
            </p>
          ) : null}
          {isCrash && tableEpisodes.length === 0 && !ongoingCrash ? (
            <p className="corr-history__more">No completed crash episodes in this downsampled view.</p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
