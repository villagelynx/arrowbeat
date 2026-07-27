export function AboutPage() {
  return (
    <article className="about" aria-labelledby="about-title">
      <header className="about__hero">
        <p className="about__kicker">ArrowBeat</p>
        <h1 id="about-title" className="about__title">
          Daily market probability — not a crystal ball
        </h1>
        <p className="about__lede">
          ArrowBeat turns free public market data into a clear lean: how likely today&apos;s
          session is to close higher or lower for the S&amp;P 500 (via SPY), with supporting
          context for Mag7 names and commodities.
        </p>
      </header>

      <section className="panel about__panel" aria-labelledby="about-what">
        <h2 id="about-what">What it is</h2>
        <p className="panel-lede">
          A probability lean for the trading day — big arrow, odds, and the factors behind them.
        </p>
        <ul className="about__list">
          <li>
            <strong>Bias &amp; probability</strong> — P(higher close) vs P(lower close), plus a
            confidence rating from edge and factor agreement.
          </li>
          <li>
            <strong>Why this signal</strong> — ES futures, VIX, breadth, yields, seasonality,
            calendar edges, and more when they fire.
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
