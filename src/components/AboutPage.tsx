type AboutPageProps = {
  onGoDashboard?: () => void;
};

export function AboutPage({ onGoDashboard }: AboutPageProps) {
  return (
    <article className="about" aria-labelledby="about-title">
      <header className="about__hero">
        <p className="about__kicker">ArrowBeat</p>
        <h1 id="about-title" className="about__title">
          Wouldn&apos;t it be nice to know which way the market might lean — day to day?
        </h1>
        <p className="about__lede">
          ArrowBeat turns historical stats into a daily probability:{" "}
          <span className="about__lean is-up">green</span> for a higher-close lean,{" "}
          <span className="about__lean is-down">red</span> for lower, odds on screen. Mag7.
          Commodities. A scorecard on the record.
        </p>
        <p className="about__lede">
          It also surfaces timing influences people feel in real life — paydays versus rent due —
          and how those windows have historically tracked market ups and downs.
        </p>
        <p className="about__lede">
          Free Yahoo data, roughly fifteen minutes delayed. Not advice. Just a clearer lean, plus
          the calendar story behind the swings — including a thinner lean into tomorrow from stats
          we already know today.
        </p>
        <p className="about__tagline">Feel the beat.</p>
        {onGoDashboard ? (
          <button type="button" className="about__cta" onClick={onGoDashboard}>
            Try ArrowBeat today
          </button>
        ) : null}
      </header>

      <section className="panel about__panel" aria-labelledby="about-how">
        <h2 id="about-how">How it works</h2>
        <p className="panel-lede">
          Under the hood: a probability lean for the trading day — big arrow, odds, and the factors
          behind them.
        </p>
        <ul className="about__list">
          <li>
            <strong>Streaks (up / down days in a row)</strong> — consecutive green or red closes
            nudge the lean (mean reversion after soft runs, cooling after long winning runs). Full
            write-up on the <strong>Streaks</strong> page in the menu.
          </li>
          <li>
            <strong>Bias &amp; probability</strong> — P(higher close) vs P(lower close), plus a
            confidence rating from edge and factor agreement. A compact{" "}
            <strong>Tomorrow&apos;s lean</strong> uses calendar &amp; historical edges known now
            (thinner — no next-day live quotes yet).
          </li>
          <li>
            <strong>Why this signal</strong> — ES futures, VIX, breadth, yields, seasonality,
            calendar edges, and more when they fire.
          </li>
          <li>
            <strong>Cashflow calendar</strong> — payday vs rent-due windows and other real-life
            timing slices, scored against historical SPY ups and downs.
          </li>
          <li>
            <strong>CPI odds</strong> — how often SPY finished higher around mid-month inflation
            prints (eve / day / +1 / +2 vs quiet days), with a dedicated page for methodology.
          </li>
          <li>
            <strong>Stock corrections</strong> — which names on a liquid watchlist (Mag7, indexes,
            and selected large caps) are ≥10% off their rolling ~52-week high right now.
          </li>
          <li>
            <strong>Correction &amp; crash odds</strong> — historical frequencies of ≥10% and ≥20%
            drawdowns from the rolling ~52-week high, by regime.
          </li>
          <li>
            <strong>Magnificent 7</strong> — compact per-name leans ranked by P(higher close),
            with day % vs prior close.
          </li>
          <li>
            <strong>Commodities &amp; crypto</strong> — Oil, gold, Bitcoin, silver, and ETH in a
            matching compact row.
          </li>
          <li>
            <strong>Scorecard</strong> — leans saved on this device and graded when SPY&apos;s
            close vs prior is known (hit rate + Brier).
          </li>
        </ul>
      </section>

      <section className="panel about__panel" aria-labelledby="about-data">
        <h2 id="about-data">Data sources</h2>
        <p className="panel-lede">Free public feeds — no brokerage keys, no paid terminals.</p>
        <ul className="about__list">
          <li>
            <strong>Yahoo Finance</strong> — free quotes and charts, typically about{" "}
            <strong>15 minutes delayed</strong>. Used for SPY, Mag7, ES, VIX, oil, gold, silver,
            BTC, ETH, and on-demand ticker lookups.
          </li>
          <li>
            <strong>FRED</strong> — 10-year breakeven inflation and TIPS real yield series for the
            inflation / rates lens.
          </li>
          <li>
            Market data quietly refreshes about every <strong>15 minutes</strong> while the tab is
            open (and again when you return if that window has passed).
          </li>
        </ul>
      </section>

      <section className="panel about__panel" aria-labelledby="about-not">
        <h2 id="about-not">What it is not</h2>
        <p className="about__disclaimer">
          ArrowBeat is educational. It is <strong>not investment advice</strong>, not a guarantee,
          and not a broker. Markets can move against any lean. Quotes can be delayed; futures trade
          nearly 24 hours. Use it as a calendar and probability lens — not a trading system.
        </p>
      </section>
    </article>
  );
}
