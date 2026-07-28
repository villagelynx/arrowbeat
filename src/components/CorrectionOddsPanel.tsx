import {
  type CorrectionHorizon,
  type CorrectionOdds,
} from "../lib/correction-probability";

const HORIZON_LABELS: Record<CorrectionHorizon, string> = {
  "3mo": "~3 months",
  "6mo": "~6 months",
  "12mo": "~12 months",
};

function pctCell(rate: { pct: number | null; total: number }, thin = false) {
  if (rate.total < 8) {
    return (
      <span className="corr-odds__thin" title="Fewer than 8 historical matches in this bucket">
        thin sample
      </span>
    );
  }
  if (rate.pct == null) return "—";
  return (
    <span className={thin ? "corr-odds__pct is-secondary" : "corr-odds__pct"}>
      {rate.pct.toFixed(1)}%
    </span>
  );
}

type Props = {
  odds: CorrectionOdds;
  /** Dashboard embed vs dedicated page layout. */
  variant?: "dashboard" | "page";
  onOpenFullPage?: () => void;
};

export function CorrectionOddsPanel({ odds, variant = "dashboard", onOpenFullPage }: Props) {
  const primaryHorizon: CorrectionHorizon = "6mo";
  const h = odds.horizons?.[primaryHorizon];
  if (!h?.unconditional) return null;
  const cond =
    !odds.alreadyInCorrection &&
    (h.conditionalCombined.total >= 8 ? h.conditionalCombined : h.conditionalDrawdown);
  const condLabel =
    h.conditionalCombined.total >= 8 && odds.vixBucketLabel
      ? "Similar drawdown + VIX"
      : "Similar drawdown";

  const titleId = variant === "page" ? "correction-panel-title" : "correction-title";

  return (
    <section
      className={`panel panel--correction${variant === "page" ? " panel--correction-page" : " desk-row desk-row--correction"}`}
      aria-labelledby={titleId}
    >
      <div className="corr-odds__head">
        <h2 id={titleId}>
          {variant === "page" ? "Current snapshot" : "Correction odds (historical)"}
        </h2>
        {variant === "dashboard" && onOpenFullPage ? (
          <a
            href="#correction"
            className="corr-odds__full-link"
            onClick={(e) => {
              e.preventDefault();
              onOpenFullPage();
            }}
          >
            Open full page
          </a>
        ) : null}
      </div>
      <p className="panel-lede">
        How often SPY fell ≥10% below its rolling ~52-week high within a forward window — not a
        crash forecast.
      </p>

      <div className="corr-odds__snapshot">
        <div className="corr-odds__metric">
          <p className="corr-odds__kicker">Distance from 52w high</p>
          <p
            className={`corr-odds__hero ${
              odds.drawdownPct <= -10
                ? "is-down"
                : odds.drawdownPct <= -5
                  ? "is-warn"
                  : "is-up"
            }`}
          >
            {odds.drawdownPct >= 0 ? "+" : ""}
            {odds.drawdownPct.toFixed(1)}%
          </p>
          <p className="corr-odds__sub">
            SPY {odds.lastClose.toFixed(2)} · peak {odds.peak52w.toFixed(2)}
          </p>
        </div>
        <div className="corr-odds__metric">
          <p className="corr-odds__kicker">Current regime</p>
          <p className="corr-odds__regime">{odds.drawdownBucketLabel}</p>
          {odds.vixLast != null ? (
            <p className="corr-odds__sub">
              VIX {odds.vixLast.toFixed(1)}
              {odds.vixBucketLabel ? ` · ${odds.vixBucketLabel}` : ""}
            </p>
          ) : (
            <p className="corr-odds__sub">VIX unavailable</p>
          )}
          {odds.daysSinceCorrection != null && odds.daysSinceCorrection > 0 ? (
            <p className="corr-odds__sub">
              ~{odds.daysSinceCorrection} sessions since last ≥10% drawdown
            </p>
          ) : null}
        </div>
      </div>

      {odds.alreadyInCorrection ? (
        <p className="corr-odds__flag" role="status">
          SPY is already in a ≥10% correction vs its 52-week high. Conditional “entry” odds below
          apply to days that had not yet corrected; compare to baseline for context.
        </p>
      ) : null}

      <div className="corr-odds__hero-stat">
        <p className="corr-odds__kicker">
          P(≥10% correction within {HORIZON_LABELS[primaryHorizon]})
        </p>
        <div className="corr-odds__compare">
          {cond && cond.total >= 8 ? (
            <>
              <div>
                <p className="corr-odds__compare-label">{condLabel}</p>
                <p className="corr-odds__compare-value">{pctCell(cond)}</p>
                <p className="corr-odds__compare-n">n = {cond.total}</p>
              </div>
              <div className="corr-odds__vs" aria-hidden="true">
                vs
              </div>
            </>
          ) : null}
          <div className={cond && cond.total >= 8 ? undefined : "corr-odds__compare--solo"}>
            <p className="corr-odds__compare-label">Any random day (baseline)</p>
            <p className="corr-odds__compare-value corr-odds__compare-value--muted">
              {pctCell(h.unconditional)}
            </p>
            <p className="corr-odds__compare-n">n = {h.unconditional.total}</p>
          </div>
        </div>
      </div>

      <table className="corr-odds__table">
        <caption className="corr-odds__caption">
          Forward-window hit rates · {odds.sampleLabel}
        </caption>
        <thead>
          <tr>
            <th scope="col">Window</th>
            <th scope="col">Baseline</th>
            <th scope="col">Drawdown bucket</th>
            {odds.vixBucket ? <th scope="col">Drawdown + VIX</th> : null}
          </tr>
        </thead>
        <tbody>
          {(Object.keys(HORIZON_LABELS) as CorrectionHorizon[]).map((key) => {
            const row = odds.horizons?.[key];
            if (!row) return null;
            return (
              <tr key={key}>
                <th scope="row">{HORIZON_LABELS[key]}</th>
                <td>{pctCell(row.unconditional)}</td>
                <td>{pctCell(row.conditionalDrawdown, true)}</td>
                {odds.vixBucket ? (
                  <td>{pctCell(row.conditionalCombined, true)}</td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="corr-odds__interp">{odds.interpretation}</p>
      <p className="corr-odds__caveat">{odds.caveat}</p>
    </section>
  );
}
