import { useEffect, useState } from "react";
import { fetchStockCorrectionsScan } from "../lib/market-data";
import {
  CORRECTION_THRESHOLD_PCT,
  CRASH_THRESHOLD_PCT,
  type StockCorrectionRow,
  type StockCorrectionStatus,
  type StockCorrectionsScan,
} from "../lib/stock-corrections";

type Props = {
  onGoDashboard: () => void;
  onOpenCorrection?: () => void;
  onOpenCrash?: () => void;
};

function statusLabel(status: StockCorrectionStatus): string {
  switch (status) {
    case "crash":
      return `Crash / bear (≥${CRASH_THRESHOLD_PCT}%)`;
    case "correction":
      return `In correction (≥${CORRECTION_THRESHOLD_PCT}%)`;
    case "pullback":
      return "Pullback (−5% to −10%)";
    default:
      return "Near high";
  }
}

function formatUpdated(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "America/New_York",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function StockRow({ row }: { row: StockCorrectionRow }) {
  return (
    <tr className={`stock-corr__row is-${row.status}`}>
      <th scope="row">
        <span className="stock-corr__sym">{row.symbol}</span>
        <span className="stock-corr__name">{row.name}</span>
      </th>
      <td className="stock-corr__num">{row.last.toFixed(2)}</td>
      <td className="stock-corr__num">{row.peak52w.toFixed(2)}</td>
      <td className={`stock-corr__dd is-${row.status}`}>
        {row.drawdownPct >= 0 ? "+" : ""}
        {row.drawdownPct.toFixed(1)}%
      </td>
      <td>
        <span className={`stock-corr__badge is-${row.status}`}>{statusLabel(row.status)}</span>
      </td>
    </tr>
  );
}

export function StockCorrectionsPage({
  onGoDashboard,
  onOpenCorrection,
  onOpenCrash,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scan, setScan] = useState<StockCorrectionsScan | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const payload = await fetchStockCorrectionsScan();
        if (cancelled) return;
        setScan(payload);
      } catch (e) {
        if (cancelled) return;
        setScan(null);
        setError(e instanceof Error ? e.message : "Could not load stock corrections.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const inPlay = scan?.rows.filter((r) => r.inCorrection) ?? [];

  return (
    <article className="correction-page" aria-labelledby="stock-corr-title">
      <header className="correction-page__hero">
        <p className="correction-page__kicker">ArrowBeat · live watchlist</p>
        <h1 id="stock-corr-title" className="correction-page__title">
          Stock corrections
        </h1>
        <p className="correction-page__lede">
          Which names on a curated liquid watchlist are ≥{CORRECTION_THRESHOLD_PCT}% below their
          rolling ~52-week high — same drawdown rule as SPY correction odds. Delayed Yahoo quotes,
          not a full-market screener.
        </p>
        <button type="button" className="correction-page__cta" onClick={onGoDashboard}>
          Back to dashboard
        </button>
      </header>

      {loading ? (
        <p className="correction-page__status" role="status">
          Scanning watchlist vs rolling peaks…
        </p>
      ) : null}

      {!loading && error ? <p className="correction-page__status">{error}</p> : null}

      {scan ? (
        <section
          className="panel correction-page__panel panel--correction-page"
          aria-labelledby="stock-corr-snapshot"
        >
          <h2 id="stock-corr-snapshot">Current snapshot</h2>
          <p className="panel-lede">
            {scan.universeLabel}. Updated {formatUpdated(scan.fetchedAt)} · {scan.delayNote}.
          </p>
          <div className="stock-corr__metrics">
            <div className="stock-corr__metric">
              <p className="corr-odds__kicker">Scanned</p>
              <p className="corr-odds__hero is-up">{scan.scanned}</p>
              <p className="corr-odds__sub">names with enough history</p>
            </div>
            <div className="stock-corr__metric">
              <p className="corr-odds__kicker">In correction</p>
              <p className={`corr-odds__hero ${scan.inCorrection ? "is-warn" : "is-up"}`}>
                {scan.inCorrection}
              </p>
              <p className="corr-odds__sub">≥{CORRECTION_THRESHOLD_PCT}% off peak</p>
            </div>
            <div className="stock-corr__metric">
              <p className="corr-odds__kicker">Crash / bear</p>
              <p className={`corr-odds__hero ${scan.inCrash ? "is-down" : "is-up"}`}>
                {scan.inCrash}
              </p>
              <p className="corr-odds__sub">≥{CRASH_THRESHOLD_PCT}% off peak</p>
            </div>
          </div>
        </section>
      ) : null}

      {scan && inPlay.length ? (
        <section
          className="panel correction-page__panel"
          aria-labelledby="stock-corr-active"
        >
          <h2 id="stock-corr-active">Currently in correction</h2>
          <p className="panel-lede">
            Deepest drawdowns first. Crash / bear names (≥{CRASH_THRESHOLD_PCT}%) are included.
          </p>
          <div className="stock-corr__table-wrap">
            <table className="stock-corr__table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Last</th>
                  <th scope="col">52w peak</th>
                  <th scope="col">Drawdown</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {inPlay.map((row) => (
                  <StockRow key={row.symbol} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {scan && !loading && !inPlay.length ? (
        <p className="correction-page__status">
          None of the scanned names are ≥{CORRECTION_THRESHOLD_PCT}% off their rolling peak right
          now. Full watchlist below.
        </p>
      ) : null}

      {scan?.rows.length ? (
        <section
          className="panel correction-page__panel"
          aria-labelledby="stock-corr-all"
        >
          <h2 id="stock-corr-all">Full watchlist</h2>
          <p className="panel-lede">
            All scanned names sorted by drawdown depth — including those still near highs.
          </p>
          <div className="stock-corr__table-wrap">
            <table className="stock-corr__table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Last</th>
                  <th scope="col">52w peak</th>
                  <th scope="col">Drawdown</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {scan.rows.map((row) => (
                  <StockRow key={row.symbol} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

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
              SPY correction odds
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
              SPY crash odds
            </a>
          ) : null}
        </p>
      )}

      <section className="panel correction-page__panel" aria-labelledby="stock-corr-method">
        <h2 id="stock-corr-method">Methodology</h2>
        <p className="panel-lede">
          Each ticker gets a rolling ~252-session (≈52-week) peak from free Yahoo daily closes. A{" "}
          <strong>correction</strong> means the latest print is ≤
          {100 - CORRECTION_THRESHOLD_PCT}% of that peak (≥{CORRECTION_THRESHOLD_PCT}% drawdown). A{" "}
          <strong>crash / bear</strong> band uses ≥{CRASH_THRESHOLD_PCT}%.
        </p>
        <ul className="correction-page__list">
          <li>
            <strong>Universe</strong> — Mag7, major index ETFs, and a short list of liquid names —
            not the full S&amp;P 500.
          </li>
          <li>
            <strong>Peak</strong> — same rolling lookback as ArrowBeat&apos;s SPY correction odds
            (not Yahoo&apos;s calendar 52-week high field).
          </li>
          <li>
            <strong>Data</strong> — free delayed Yahoo charts (~15 minutes). Soft failures omit a
            name rather than fail the page.
          </li>
        </ul>
      </section>

      <section className="panel correction-page__panel" aria-labelledby="stock-corr-caveats">
        <h2 id="stock-corr-caveats">What this is not</h2>
        <p className="correction-page__disclaimer">
          Not a buy/sell signal or investment advice. Drawdowns can deepen or reverse quickly.
          Quotes are delayed; some symbols may be missing when Yahoo is slow. Treat the list as a
          calendar-style lens on where a small watchlist sits vs recent peaks.
        </p>
      </section>
    </article>
  );
}
