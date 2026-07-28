import type { CrashOdds } from "../lib/crash-probability";
import { CrashOddsPanel } from "./CrashOddsPanel";

type Props = {
  odds: CrashOdds | null;
  loading: boolean;
  onGoDashboard: () => void;
  onOpenCorrection?: () => void;
};

export function CrashOddsPage({ odds, loading, onGoDashboard, onOpenCorrection }: Props) {
  return (
    <article className="correction-page" aria-labelledby="crash-page-title">
      <header className="correction-page__hero">
        <p className="correction-page__kicker">ArrowBeat · historical context</p>
        <h1 id="crash-page-title" className="correction-page__title">
          Crash odds
        </h1>
        <p className="correction-page__lede">
          How often SPY fell at least 20% below its rolling ~52-week high within a forward window —
          using the common crash / bear-market threshold (≥20%), not a precise crash definition.
          Descriptive history, not a forecast.
        </p>
        <button type="button" className="correction-page__cta" onClick={onGoDashboard}>
          Back to dashboard
        </button>
      </header>

      {loading ? (
        <p className="correction-page__status" role="status">
          Loading market snapshot…
        </p>
      ) : null}

      {!loading && !odds ? (
        <p className="correction-page__status">
          Not enough SPY history to compute crash frequencies yet. Try again after the market
          snapshot loads.
        </p>
      ) : null}

      {odds ? <CrashOddsPanel odds={odds} variant="page" /> : null}

      {onOpenCorrection ? (
        <p className="correction-page__status">
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
        </p>
      ) : null}

      <section className="panel correction-page__panel" aria-labelledby="crash-method">
        <h2 id="crash-method">Methodology</h2>
        <p className="panel-lede">
          Every trading day in the sample gets a rolling ~252-session (≈52-week) peak. A{" "}
          <strong>crash / bear-market hit</strong> means SPY&apos;s close dropped to ≤80% of that
          day&apos;s peak at some point in the forward window — the common ≥20% decline threshold,
          not a precise crash definition. Includes the start day if already in drawdown.
        </p>
        <ul className="correction-page__list">
          <li>
            <strong>Baseline</strong> — unconditional hit rate for any random day in the sample
            (all regimes pooled).
          </li>
          <li>
            <strong>Drawdown bucket</strong> — only days in the same distance-from-peak band as
            today. Days already ≥20% off peak are excluded from conditional “entry” odds.
          </li>
          <li>
            <strong>Drawdown + VIX</strong> — same drawdown band plus matching VIX regime (below 15,
            15–20, 20–25, above 25) when aligned VIX history exists.
          </li>
          <li>
            <strong>Windows</strong> — ~63, ~126, and ~252 trading days forward (~3, ~6, ~12
            months). Buckets with fewer than 8 matches show as “thin sample.”
          </li>
        </ul>
      </section>

      <section className="panel correction-page__panel" aria-labelledby="crash-buckets">
        <h2 id="crash-buckets">Regime buckets</h2>
        <div className="correction-page__grid">
          <div>
            <h3 className="correction-page__subhead">Drawdown from 52w high</h3>
            <ul className="correction-page__list correction-page__list--compact">
              <li>Within 2% of peak</li>
              <li>−2% to −5% off peak</li>
              <li>−5% to −10% off peak</li>
              <li>−10% to −20% off peak</li>
              <li>Already ≥20% off peak (crash / bear threshold)</li>
            </ul>
          </div>
          <div>
            <h3 className="correction-page__subhead">VIX (when available)</h3>
            <ul className="correction-page__list correction-page__list--compact">
              <li>Below 15</li>
              <li>15–20</li>
              <li>20–25</li>
              <li>Above 25</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="panel correction-page__panel" aria-labelledby="crash-caveats">
        <h2 id="crash-caveats">What this is not</h2>
        <p className="correction-page__disclaimer">
          Historical frequency only — not investment advice or a timing signal. The ≥20% threshold
          is a widely cited crash / bear-market reference, not a formal crash definition. Past
          drawdown and VIX regimes do not guarantee future outcomes. Data comes from free Yahoo
          Finance quotes (~15 minutes delayed). Sample length and bucket counts limit precision;
          treat thin-sample cells as directional context, not precise probabilities.
        </p>
      </section>
    </article>
  );
}
