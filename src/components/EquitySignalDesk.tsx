import { MarketArrow } from "./MarketArrow";
import { SpyYearChart } from "./SpyYearChart";
import type { EquitySignal } from "../lib/signal";
import { yearFromIso } from "../lib/spy-ytd";

type Props = {
  lean: EquitySignal;
  asOfDate: string;
  /** When true, use a denser layout under the quote / Mag7 strip. */
  compact?: boolean;
};

function stars(n: number) {
  return Array.from({ length: 5 }, (_, i) => (
    <span key={i} className={i < n ? "star is-on" : "star"} aria-hidden="true">
      ★
    </span>
  ));
}

/**
 * SPY-style surface for one equity: YTD chart, ArrowBeat score + arrow,
 * last 10 sessions, factor list.
 */
export function EquitySignalDesk({ lean, asOfDate, compact = false }: Props) {
  if (!lean.available) {
    return (
      <div className="equity-desk equity-desk--muted">
        <p className="equity-desk__na">
          {lean.symbol}: not enough daily history for a full desk (need ~40+ sessions).
        </p>
      </div>
    );
  }

  const up = lean.bias === "up";
  const lead = up ? lean.probabilityHigher : lean.probabilityLower;
  const year = yearFromIso(asOfDate);
  const idSuffix = lean.symbol.replace(/[^A-Za-z0-9]/g, "");

  return (
    <div
      className={`equity-desk ${up ? "is-up" : "is-down"}${compact ? " equity-desk--compact" : ""}`}
    >
      <div className="equity-desk__head">
        <div>
          <p className="equity-desk__kicker">
            {lean.symbol}
            {lean.name && lean.name !== lean.symbol ? ` · ${lean.name}` : ""}
          </p>
          <h3 className="equity-desk__title">ArrowBeat lean</h3>
        </div>
        {lean.changePct != null ? (
          <p className={`equity-desk__day ${lean.changePct >= 0 ? "is-up" : "is-down"}`}>
            Day {lean.changePct >= 0 ? "+" : ""}
            {lean.changePct.toFixed(2)}%
          </p>
        ) : null}
      </div>

      <div className="equity-desk__grid">
        <div className="equity-desk__chart">
          {lean.bars.length >= 2 ? (
            <SpyYearChart
              bars={lean.bars}
              year={year}
              symbol={lean.symbol}
              gradientId={`ytd-${idSuffix}`}
            />
          ) : (
            <p className="spy-chart__empty">No chart bars for {lean.symbol}.</p>
          )}
        </div>

        <div className="equity-desk__signal">
          <p className="equity-desk__prob">
            {lead.toFixed(1)}
            <span>%</span>
          </p>
          <p className="equity-desk__score-label">ArrowBeat Score</p>
          <div className="equity-desk__arrow">
            <MarketArrow bias={lean.bias} idSuffix={idSuffix} />
          </div>
          <p className="equity-desk__chip">{up ? "Higher-close lean" : "Lower-close lean"}</p>
          <div className="equity-desk__meter-wrap">
            <p className="equity-desk__meter-label">
              Probability of {up ? "higher" : "lower"} close
            </p>
            <div className="prob-meter" role="presentation">
              <div
                className="prob-meter__fill"
                style={{ width: `${Math.min(92, Math.max(8, lead))}%` }}
              />
            </div>
            <p className="equity-desk__split">
              Higher {lean.probabilityHigher.toFixed(1)}% · Lower {lean.probabilityLower.toFixed(1)}%
            </p>
          </div>
          <div className="equity-desk__conf">
            <p className="equity-desk__conf-label">Confidence</p>
            <p
              className="equity-desk__stars"
              aria-label={`${lean.confidence} of 5 stars`}
            >
              {stars(lean.confidence)}
            </p>
            <p className="equity-desk__conf-text">{lean.confidenceLabel}</p>
          </div>
        </div>
      </div>

      {lean.lastSessions.length ? (
        <div className="equity-desk__sessions">
          <h4 className="equity-desk__section-title">Last 10 trading days</h4>
          <p className="equity-desk__section-lede">
            {lean.symbol} close vs prior close — green up, red down. Hist % is this name&apos;s
            weekday higher-close rate (~1y).
          </p>
          <ol className="session-strip">
            {lean.lastSessions.map((day) => {
              const dateLabel = new Intl.DateTimeFormat("en-US", {
                timeZone: "America/New_York",
                month: "short",
                day: "numeric",
              }).format(new Date(`${day.date}T12:00:00-04:00`));
              return (
                <li
                  key={day.date}
                  className={day.bias === "up" ? "is-up" : "is-down"}
                  title={`${day.date}: ${day.changePct >= 0 ? "+" : ""}${day.changePct.toFixed(2)}%`}
                >
                  <span className="session-day">{day.weekday}</span>
                  <span className="session-date">{dateLabel}</span>
                  <span className="session-arrow" aria-hidden="true">
                    {day.bias === "up" ? "▲" : "▼"}
                  </span>
                  <span className="session-pct">
                    {day.changePct >= 0 ? "+" : ""}
                    {day.changePct.toFixed(1)}%
                  </span>
                  {day.histUpPct != null ? (
                    <span className="session-hist">
                      Hist {day.histUpPct.toFixed(0)}%
                      {day.histRank != null ? ` · #${day.histRank}` : ""}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}

      {lean.factors.length ? (
        <div className="equity-desk__factors">
          <h4 className="equity-desk__section-title">Why this signal</h4>
          <ul className="equity-desk__factor-list">
            {lean.factors.map((f) => (
              <li key={f.id} className={f.supports === "up" ? "is-up" : "is-down"}>
                <span aria-hidden="true">{f.supports === "up" ? "▲" : "▼"}</span>
                <span>
                  {f.label}
                  <small>{f.detail}</small>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
