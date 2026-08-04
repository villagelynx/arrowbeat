type FinancialModelPageProps = {
  onGoHome?: () => void;
  onOpenStreaks?: () => void;
};

/**
 * Full financial model write-up — mirrors scorer logic in signal.ts (educational only).
 */
export function FinancialModelPage({ onGoHome, onOpenStreaks }: FinancialModelPageProps) {
  return (
    <article className="about" aria-labelledby="model-title">
      <header className="about__hero">
        <p className="about__kicker">ArrowBeat · methodology</p>
        <h1 id="model-title" className="about__title">
          The financial model, in detail
        </h1>
        <p className="about__lede">
          ArrowBeat does not forecast prices with a neural net or a terminal black box. It builds a{" "}
          <strong>probability lean</strong> — whether today&apos;s (or the next session&apos;s)
          close finishes higher than prior — by starting from a historical base rate, applying
          a small set of rules-based tilts, then clamping so the number never pretends to be
          near-certain.
        </p>
        <p className="about__lede">
          This page matches the live scorer. Educational only — not investment advice, not a
          trading system, and never a guarantee.
        </p>
        {onGoHome ? (
          <button type="button" className="about__cta" onClick={onGoHome}>
            Back to home
          </button>
        ) : null}
      </header>

      <section className="panel about__panel" aria-labelledby="model-output">
        <h2 id="model-output">What the model outputs</h2>
        <p className="panel-lede">
          For each lean (SPY desk today, Mag7 / quote ticker, tomorrow, next five sessions), the
          model produces:
        </p>
        <ul className="about__list">
          <li>
            <strong>Bias</strong> — up if the score is ≥ 50%, else down.
          </li>
          <li>
            <strong>P(higher close)</strong> and <strong>P(lower close)</strong> — a pair that adds
            to 100%, shown as e.g. 58.2% / 41.8%.
          </li>
          <li>
            <strong>Confidence stars (1–5)</strong> — not a statistical p-value. It rises when both{" "}
            <em>edge</em> (|probability − 50|) and <em>factor agreement</em> (how many “Why this
            signal” rows support the bias) are strong.
          </li>
          <li>
            <strong>Factors</strong> — readable rows that say which inputs fired and which side they
            support.
          </li>
        </ul>
        <p className="about__disclaimer">
          Confidence ladder: edge &gt; 12 pts and ≥5 aligned factors → Very high (5); edge &gt; 8 and
          ≥4 → High (4); edge &gt; 5 and ≥3 → Moderate (3); edge &gt; 3 → Low (2); else Tentative
          (1).
        </p>
      </section>

      <section className="panel about__panel" aria-labelledby="model-score">
        <h2 id="model-score">Core score shape</h2>
        <p className="panel-lede">
          Internally the model keeps one number, <strong>score</strong>, on a 0–1 scale
          (probability of a higher close):
        </p>
        <ol className="about__list">
          <li>
            Start at a <strong>base rate</strong> (share of higher closes in the sample).
          </li>
          <li>
            Add or subtract <strong>tilts</strong> when conditions are true.
          </li>
          <li>
            <strong>Clamp</strong> into a band so extremes are hard to hit.
          </li>
          <li>Round to one decimal percent for display.</li>
        </ol>
        <p className="panel-lede" style={{ marginTop: "0.75rem" }}>
          Live SPY and stock desks clamp to <strong>28%–78%</strong>. Tomorrow / forward session
          leans clamp tighter to <strong>32%–72%</strong> because they lack a full live tape.
        </p>
      </section>

      <section className="panel about__panel" aria-labelledby="model-spy-today">
        <h2 id="model-spy-today">SPY desk · today&apos;s live signal</h2>
        <p className="panel-lede">
          Main home arrow when the desk is SPY. Inputs come from the market snapshot (Yahoo delayed
          quotes + bars; FRED inflation series when available).
        </p>

        <h3 className="about__subtitle">Base rate</h3>
        <p className="panel-lede">
          From SPY daily closes, roughly the last <strong>~10 years</strong> (~2,520 trading days
          when available):
        </p>
        <ul className="about__list">
          <li>
            score starts at <strong>decade higher-close %</strong> / 100.
          </li>
        </ul>

        <h3 className="about__subtitle">Calendar &amp; streak tilts</h3>
        <ul className="about__list">
          <li>
            <strong>Monday</strong> −2.5 pts (softer historical open); <strong>Friday</strong> +1
            pt.
          </li>
          <li>
            <strong>Down streak</strong> into today: 2 days → +3 pts; 3+ days → +5.5 pts
            (mean-reversion after soft runs).
          </li>
          <li>
            <strong>Up streak</strong> of 4+ green closes → −3.5 pts (cooling after long runs).
          </li>
          <li>
            Full streak write-up:{" "}
            {onOpenStreaks ? (
              <button type="button" className="about__text-btn" onClick={onOpenStreaks}>
                Streaks methodology
              </button>
            ) : (
              "Streaks page in the menu"
            )}
            .
          </li>
        </ul>

        <h3 className="about__subtitle">Risk tone (live)</h3>
        <ul className="about__list">
          <li>
            <strong>ES futures</strong> (ES=F) vs prior session — green supports up; red supports
            down. Magnitude capped near 5 percentage points so a wild tick cannot dominate.
          </li>
          <li>
            <strong>VIX</strong> falling day-over-day → +2.5 pts; rising → −2 pts.
          </li>
          <li>
            <strong>Breadth proxy</strong> — RSP (equal-weight S&amp;P) 5-session change vs SPY.
            Equal-weight keeping up → +2 pts; lagging (narrow leadership) → −1.5 pts.
          </li>
        </ul>

        <h3 className="about__subtitle">Rates, inflation &amp; commodities</h3>
        <ul className="about__list">
          <li>
            <strong>10Y yield (^TNX)</strong> rising over recent sessions → −2 pts.
          </li>
          <li>
            <strong>10Y real yield (FRED DFII10)</strong> rising ~5+ bps → −2.5 pts; falling → +1.5
            pts.
          </li>
          <li>
            <strong>10Y breakeven (FRED T10YIE)</strong> rising sharply → −1.5 pts.
          </li>
          <li>
            <strong>Oil / gold</strong> only on larger ~5-session moves: sharp rises mildly pressure
            equities; sharp drops mildly support risk-on.
          </li>
        </ul>

        <h3 className="about__subtitle">Mild calendar checks</h3>
        <ul className="about__list">
          <li>Month seasonality above/below 50% → ±1 pt.</li>
          <li>Day-of-month hist up-rate ≥ 52% → +1 pt; ≤ 48% → −1 pt.</li>
          <li>
            <strong>CPI window</strong> (approx. weekday nearest the 12th — not official BLS dates):
            when today lands on eve / print / +1 / +2, ±1 pt from historical rates in that bucket.
          </li>
        </ul>
        <p className="about__disclaimer">
          Payday (1st/15th) vs late-month rent windows and March vs April tax season power the
          tomorrow / forward leans and desk education copy more than large live-day weights.
        </p>
      </section>

      <section className="panel about__panel" aria-labelledby="model-stocks">
        <h2 id="model-stocks">Stock desk · Mag7 &amp; quote tickers</h2>
        <p className="panel-lede">
          When you pick AAPL, NVDA, or type a ticker, the main arrow uses that name&apos;s own
          history — not the SPY base rate.
        </p>
        <ul className="about__list">
          <li>
            Needs ~40+ daily bars and ≥30 returns; otherwise the name stays unavailable (50/50).
          </li>
          <li>
            <strong>Base rate</strong> = higher-close share over ~1 year (~252 sessions) for that
            ticker.
          </li>
          <li>
            Own weekday / month / day-of-month edges vs 50%, with weights about 0.28 / 0.18 / 0.16.
          </li>
          <li>Same streak rules applied to that ticker&apos;s closes.</li>
          <li>Short 5-session momentum and relative performance vs SPY at light weight.</li>
          <li>Shared ES / VIX tone at lighter weights than full SPY desk.</li>
          <li>Payday / rent windows from the stock&apos;s own day-of-month table (light weight).</li>
          <li>
            Still clamps to <strong>28%–78%</strong>.
          </li>
        </ul>
      </section>

      <section className="panel about__panel" aria-labelledby="model-tomorrow">
        <h2 id="model-tomorrow">Tomorrow &amp; next 5 sessions</h2>
        <p className="panel-lede">
          Intentionally thinner: no next-day ES, VIX, or breadth — only calendar facts and completed
          history known today.
        </p>
        <ul className="about__list">
          <li>
            Step to the next Mon–Fri session (weekends skipped; holidays not modeled).
          </li>
          <li>
            Restart from base rate, then weight weekday (~0.35), month (~0.28), day-of-month (~0.28)
            distance from 50%, plus payday/rent group averages, tax month, CPI window row, and
            reduced streak tilts.
          </li>
          <li>
            Clamp to <strong>32%–72%</strong>.
          </li>
          <li>
            <strong>Next 5</strong> repeats that path for five sequential trading days — the strip
            under the arrow / desk snapshot.
          </li>
        </ul>
      </section>

      <section className="panel about__panel" aria-labelledby="model-alts">
        <h2 id="model-alts">Commodities &amp; crypto</h2>
        <p className="panel-lede">
          Oil, gold, Bitcoin, silver, and ETH use a short momentum lean (day move + short path + light
          risk tone) — not the full SPY calendar stack. Compact cards only; not the hero arrow.
        </p>
      </section>

      <section className="panel about__panel" aria-labelledby="model-other">
        <h2 id="model-other">Related tools (separate from the daily lean)</h2>
        <ul className="about__list">
          <li>
            <strong>Correction / crash odds</strong> — historical frequencies of ≥10% / ≥20%
            drawdowns from a rolling ~52-week peak; not fed into the day score.
          </li>
          <li>
            <strong>Stock corrections</strong> — which liquid names are currently ≥10% off that peak.
          </li>
          <li>
            <strong>CPI odds page</strong> — standalone tabulation around approx. print windows.
          </li>
          <li>
            <strong>Scorecard</strong> — saves leans on-device and grades them when the next SPY
            result is known (hit rate + Brier). Tracks record only; does not retrain weights.
          </li>
        </ul>
      </section>

      <section className="panel about__panel" aria-labelledby="model-data">
        <h2 id="model-data">Data &amp; timing</h2>
        <ul className="about__list">
          <li>
            <strong>Yahoo Finance</strong> — free delayed quotes and daily charts (~15 minutes). SPY,
            Mag7, futures, VIX, commodities, crypto, on-demand tickers.
          </li>
          <li>
            <strong>FRED</strong> — 10-year breakeven and TIPS real yield for the rates lens.
          </li>
          <li>
            Session dates and weekdays use the <strong>America/New_York</strong> calendar.
          </li>
          <li>
            After the regular close, Home can promote the locked <strong>next-session lean</strong>{" "}
            into the SPY hero — same thinner model, known before the next open.
          </li>
        </ul>
      </section>

      <section className="panel about__panel" aria-labelledby="model-limits">
        <h2 id="model-limits">What this is not</h2>
        <ul className="about__list">
          <li>Not machine-learning fit or live re-optimization of weights.</li>
          <li>Not options pricing, VaR, or portfolio construction.</li>
          <li>Not a substitute for fundamentals, news, or risk management.</li>
          <li>
            Historical higher-close rates can drift; free data can gap or soft-fail (demo fallback).
          </li>
          <li>
            Clamps exist so a pile of aligned factors cannot print “99% certainty.”
          </li>
        </ul>
        <p className="about__disclaimer">
          ArrowBeat is educational. Past higher-close frequencies are not future guarantees. Do your
          own research; consult a licensed adviser for personal decisions.
        </p>
        {onGoHome ? (
          <button type="button" className="about__cta" onClick={onGoHome}>
            Back to desk
          </button>
        ) : null}
      </section>
    </article>
  );
}
