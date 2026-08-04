import type { CpiWindowInsight } from "../lib/cpi-calendar";
import { CpiOddsPanel } from "./CpiOddsPanel";

type Props = {
  insight: CpiWindowInsight | null;
  loading: boolean;
  onGoDashboard: () => void;
  onOpenCorrection?: () => void;
  onOpenCrash?: () => void;
};

export function CpiOddsPage({
  insight,
  loading,
  onGoDashboard,
  onOpenCorrection,
  onOpenCrash,
}: Props) {
  return (
    <article className="correction-page" aria-labelledby="cpi-page-title">
      <header className="correction-page__hero">
        <p className="correction-page__kicker">ArrowBeat · historical context</p>
        <h1 id="cpi-page-title" className="correction-page__title">
          CPI odds
        </h1>
        <p className="correction-page__lede">
          How often SPY finished higher around mid-month inflation prints — CPI eve, CPI day, the
          two sessions after, versus quiet days. Descriptive calendar history, not a forecast.
        </p>
        <button type="button" className="correction-page__cta" onClick={onGoDashboard}>
          Back to home
        </button>
      </header>

      {loading ? (
        <p className="correction-page__status" role="status">
          Loading market snapshot…
        </p>
      ) : null}

      {!loading && !insight ? (
        <p className="correction-page__status">
          Not enough SPY history to compute CPI window frequencies yet. Try again after the market
          snapshot loads.
        </p>
      ) : null}

      {insight ? <CpiOddsPanel insight={insight} variant="page" /> : null}

      {(onOpenCorrection || onOpenCrash) && (
        <p className="correction-page__status">
          {onOpenCorrection ? (
            <a
              href="#correction"
              className="corr-odds__full-link"
              onClick={(e) => {
                e.preventDefault();
                onOpenCorrection();
              }}
            >
              See correction odds (≥10%)
            </a>
          ) : null}
          {onOpenCorrection && onOpenCrash ? " · " : null}
          {onOpenCrash ? (
            <a
              href="#crash"
              className="corr-odds__full-link"
              onClick={(e) => {
                e.preventDefault();
                onOpenCrash();
              }}
            >
              See crash odds (≥20%)
            </a>
          ) : null}
        </p>
      )}

      <section className="panel correction-page__panel" aria-labelledby="cpi-method">
        <h2 id="cpi-method">Methodology</h2>
        <p className="panel-lede">
          Each trading day in the ~10-year SPY sample is tagged relative to an approximate CPI
          release date — the weekday nearest the 12th of each month (Sunday → Monday, Saturday →
          Friday). That is a calendar proxy, not the official BLS schedule.
        </p>
        <ul className="correction-page__list">
          <li>
            <strong>CPI eve</strong> — the trading session immediately before the proxy release
            date.
          </li>
          <li>
            <strong>CPI day</strong> — the proxy release date itself (when it falls on a trading
            day).
          </li>
          <li>
            <strong>CPI +1 / +2</strong> — the first and second trading sessions after the proxy
            print.
          </li>
          <li>
            <strong>Quiet days</strong> — everything else in the sample.
          </li>
          <li>
            <strong>Ranks</strong> — buckets sorted by historical higher-close rate, then average
            move. “Window vs quiet” is the weighted up-rate across eve/day/+1/+2 minus quiet days.
          </li>
        </ul>
      </section>

      <section className="panel correction-page__panel" aria-labelledby="cpi-windows">
        <h2 id="cpi-windows">What the window captures</h2>
        <div className="correction-page__grid">
          <div>
            <h3 className="correction-page__subhead">Inflation print days</h3>
            <ul className="correction-page__list correction-page__list--compact">
              <li>CPI eve</li>
              <li>CPI day</li>
              <li>CPI +1</li>
              <li>CPI +2</li>
            </ul>
          </div>
          <div>
            <h3 className="correction-page__subhead">Baseline</h3>
            <ul className="correction-page__list correction-page__list--compact">
              <li>Quiet days (rest of sample)</li>
              <li>Window vs quiet (pts)</li>
              <li>Next proxy release date</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="panel correction-page__panel" aria-labelledby="cpi-caveats">
        <h2 id="cpi-caveats">What this is not</h2>
        <p className="correction-page__disclaimer">
          Historical frequency only — not investment advice or a timing signal. Approximate release
          dates can differ from official BLS prints (holidays, schedule shifts). Past CPI-window
          behavior does not guarantee future outcomes. Data comes from free Yahoo Finance quotes
          (~15 minutes delayed). Treat ranks as a calendar lens, not precise probabilities.
        </p>
      </section>
    </article>
  );
}
