import type { HitWindow, PredictionRecord } from "../lib/scorecard";
import { ScorePredictionList } from "./ScorePredictionList";

type ScoreHistoryPageProps = {
  rows: PredictionRecord[];
  hitRate100: HitWindow;
  brier: number | null;
  onGoHome?: () => void;
  onGoScorecard?: () => void;
};

export function ScoreHistoryPage({
  rows,
  hitRate100,
  brier,
  onGoHome,
  onGoScorecard,
}: ScoreHistoryPageProps) {
  return (
    <article className="about" aria-labelledby="score-history-title">
      <header className="about__hero">
        <p className="about__kicker">ArrowBeat · scorecard</p>
        <h1 id="score-history-title" className="about__title">
          Last 100 settled sessions
        </h1>
        <p className="about__lede">
          Full graded history for the last-100 hit rate. Newest sessions first. Hit = direction
          matched the official SPY close vs prior.
        </p>
        <div className="score-history__actions">
          {onGoScorecard ? (
            <button type="button" className="about__cta" onClick={onGoScorecard}>
              Back to scorecard
            </button>
          ) : null}
          {onGoHome ? (
            <button type="button" className="score-history__secondary" onClick={onGoHome}>
              Home
            </button>
          ) : null}
        </div>
      </header>

      <section className="panel about__panel" aria-labelledby="score-history-stats">
        <h2 id="score-history-stats">Last 100 summary</h2>
        <div className="stat-grid score-grid">
          <div className="stat-card">
            <p className="stat-kicker">Hit rate · last 100</p>
            <p className="stat-num">
              {hitRate100.hitRate != null ? `${hitRate100.hitRate.toFixed(1)}%` : "—"}
            </p>
            <p className="stat-note">
              {hitRate100.settled
                ? `${hitRate100.hits}/${hitRate100.settled} settled`
                : "No settled days yet"}
            </p>
          </div>
          <div className="stat-card">
            <p className="stat-kicker">Brier · last 100</p>
            <p className="stat-num">{brier != null ? brier.toFixed(3) : "—"}</p>
            <p className="stat-note">vs ~0.25 coin flip</p>
          </div>
        </div>
      </section>

      <section className="panel about__panel" aria-labelledby="score-history-list">
        <h2 id="score-history-list">Session log</h2>
        <p className="panel-lede">
          Showing {rows.length} settled session{rows.length === 1 ? "" : "s"}
          {rows.length >= 100 ? " (capped at 100)" : ""}.
        </p>
        <ScorePredictionList rows={rows} ariaLabel="Last 100 settled predictions" />
      </section>
    </article>
  );
}
