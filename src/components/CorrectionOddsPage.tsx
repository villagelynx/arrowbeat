import { useEffect, useMemo, useState } from "react";
import { buildCorrectionHistory } from "../lib/correction-history";
import type { CorrectionOdds } from "../lib/correction-probability";
import { fetchSp500History } from "../lib/sp500-history";
import { CorrectionOddsPanel } from "./CorrectionOddsPanel";
import { CorrectionsHistoryChart } from "./CorrectionsHistoryChart";

type Props = {
  odds: CorrectionOdds | null;
  loading: boolean;
  onGoDashboard: () => void;
  onOpenCrash?: () => void;
};

export function CorrectionOddsPage({ odds, loading, onGoDashboard, onOpenCrash }: Props) {
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLabel, setHistoryLabel] = useState("S&P 500");
  const [historyBars, setHistoryBars] = useState<{ date: string; close: number }[]>([]);
  const [historyRange, setHistoryRange] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const payload = await fetchSp500History();
        if (cancelled) return;
        setHistoryBars(payload.bars);
        setHistoryLabel(payload.label || "S&P 500");
        setHistoryRange(payload.rangeLabel);
      } catch (e) {
        if (cancelled) return;
        setHistoryBars([]);
        setHistoryError(
          e instanceof Error ? e.message : "Could not load long-run S&P 500 history.",
        );
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const correctionHistory = useMemo(() => {
    if (!historyBars.length) return null;
    return buildCorrectionHistory(historyBars, historyRange || "long sample");
  }, [historyBars, historyRange]);
  return (
    <article className="correction-page" aria-labelledby="correction-page-title">
      <header className="correction-page__hero">
        <p className="correction-page__kicker">ArrowBeat · historical context</p>
        <h1 id="correction-page-title" className="correction-page__title">
          Correction odds
        </h1>
        <p className="correction-page__lede">
          How often SPY fell at least 10% below its rolling ~52-week high within a forward window —
          given where the market sits today. Descriptive history, not a crash forecast.
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
          Not enough SPY history to compute correction frequencies yet. Try again after the market
          snapshot loads.
        </p>
      ) : null}

      {odds ? <CorrectionOddsPanel odds={odds} variant="page" /> : null}

      <section
        className="panel correction-page__panel panel--corr-history"
        aria-labelledby="correction-history-title"
      >
        <h2 id="correction-history-title">~100 years of corrections</h2>
        <p className="panel-lede">
          Daily {historyLabel} closes vs a rolling ~52-week high — same ≥10% correction rule as the
          odds above. Crash / bear episodes (≥20%) are shaded darker.
        </p>
        {historyLoading ? (
          <p className="correction-page__status" role="status">
            Loading long-run index history…
          </p>
        ) : null}
        {!historyLoading && historyError ? (
          <p className="correction-page__status">{historyError}</p>
        ) : null}
        {!historyLoading && correctionHistory ? (
          <CorrectionsHistoryChart history={correctionHistory} label={historyLabel} variant="page" />
        ) : null}
      </section>

      {onOpenCrash ? (
        <p className="correction-page__status">
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
        </p>
      ) : null}

      <section className="panel correction-page__panel" aria-labelledby="correction-method">
        <h2 id="correction-method">Methodology</h2>
        <p className="panel-lede">
          Every trading day in the sample gets a rolling ~252-session (≈52-week) peak. A{" "}
          <strong>correction</strong> means SPY&apos;s close dropped to ≤90% of that day&apos;s peak
          at some point in the forward window — including the start day if already in drawdown.
        </p>
        <ul className="correction-page__list">
          <li>
            <strong>Baseline</strong> — unconditional hit rate for any random day in the sample
            (all regimes pooled).
          </li>
          <li>
            <strong>Drawdown bucket</strong> — only days in the same distance-from-peak band as
            today (within 2%, −2% to −5%, −5% to −10%, or already ≥10% off peak). Days already in
            correction are excluded from conditional “entry” odds.
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

      <section className="panel correction-page__panel" aria-labelledby="correction-buckets">
        <h2 id="correction-buckets">Regime buckets</h2>
        <div className="correction-page__grid">
          <div>
            <h3 className="correction-page__subhead">Drawdown from 52w high</h3>
            <ul className="correction-page__list correction-page__list--compact">
              <li>Within 2% of peak</li>
              <li>−2% to −5% off peak</li>
              <li>−5% to −10% off peak</li>
              <li>Already ≥10% off peak (in correction)</li>
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

      <section className="panel correction-page__panel" aria-labelledby="correction-caveats">
        <h2 id="correction-caveats">What this is not</h2>
        <p className="correction-page__disclaimer">
          Historical frequency only — not investment advice or a timing signal. Past drawdown and
          VIX regimes do not guarantee future corrections. Data comes from free Yahoo Finance quotes
          (~15 minutes delayed). Sample length and bucket counts limit precision; treat thin-sample
          cells as directional context, not precise probabilities.
        </p>
      </section>
    </article>
  );
}
