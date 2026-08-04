type StreaksPageProps = {
  onGoHome?: () => void;
};

/**
 * Explains how consecutive up / down sessions feed ArrowBeat scores
 * (mirrors scorer logic in signal.ts — educational only).
 */
export function StreaksPage({ onGoHome }: StreaksPageProps) {
  return (
    <article className="about" aria-labelledby="streaks-title">
      <header className="about__hero">
        <p className="about__kicker">ArrowBeat · methodology</p>
        <h1 id="streaks-title" className="about__title">
          Up days and down days in a row
        </h1>
        <p className="about__lede">
          Yes — ArrowBeat <strong>does</strong> look at how many sessions in a row finished higher
          or lower when it builds the probability lean. That “streak” is one factor among several;
          it is not the whole model, and it is not a guarantee of what happens next.
        </p>
        <p className="about__lede">
          This page explains, in detail, <em>how</em> we define a streak, how it moves the odds,
          when it appears under “Why this signal,” and how that works for SPY versus individual
          stocks (and for tomorrow’s thinner calendar lean).
        </p>
        {onGoHome ? (
          <button type="button" className="about__cta" onClick={onGoHome}>
            Back to home
          </button>
        ) : null}
      </header>

      <section className="panel about__panel" aria-labelledby="streaks-what">
        <h2 id="streaks-what">What is a streak here?</h2>
        <p className="panel-lede">
          A streak is built from daily percentage changes — each session’s close versus the prior
          session’s close.
        </p>
        <ul className="about__list">
          <li>
            <strong>Up day</strong> — the close was higher than the previous close (return &gt; 0).
          </li>
          <li>
            <strong>Down day</strong> — the close was lower (return &lt; 0).
          </li>
          <li>
            <strong>Flat day</strong> — roughly unchanged (return = 0). A flat day stops counting the
            streak.
          </li>
        </ul>
        <p className="panel-lede" style={{ marginTop: "0.75rem" }}>
          We walk backward from the most recent completed day in the sample:
        </p>
        <ul className="about__list">
          <li>
            If the latest days are all down, we count consecutive <strong>down</strong> days until we
            hit an up day, a flat day, or run out of history.
          </li>
          <li>
            If the latest days are all up, we count consecutive <strong>up</strong> days the same
            way.
          </li>
          <li>
            Only one side is “live” at a time — the streak into today is either an up stretch or a
            down stretch, not both.
          </li>
        </ul>
        <p className="about__disclaimer">
          Example: if the last four finishes were −0.4%, −1.1%, −0.2%, +0.8%, the streak into today
          is three down days (the most recent up day ends the run when we walk backward from “now”).
          When the tip of the history is three red sessions, that length feeds the scorer.
        </p>
      </section>

      <section className="panel about__panel" aria-labelledby="streaks-why">
        <h2 id="streaks-why">Why count streaks at all?</h2>
        <p className="panel-lede">
          Markets often mean-revert a little after soft stretches and sometimes cool after long green
          runs. ArrowBeat does not claim that “always” happens; it uses a small, capped nudge
          inspired by those patterns, then still mixes in calendar edges, futures, vol, and other
          factors.
        </p>
        <ul className="about__list">
          <li>
            <strong>After soft stretches</strong> — several down sessions in a row → we lean a bit
            more toward a higher close next (mean-reversion style tilt).
          </li>
          <li>
            <strong>After long winning stretches</strong> — several up sessions in a row → we lean a
            bit more toward a lower close next (cooling-off style tilt).
          </li>
          <li>
            <strong>Historical footnote</strong> — for down stretches we also look at how often the{" "}
            <em>next</em> session finished higher after a down day in that name’s (or SPY’s) sample.
            That number shows up in the factor detail when a down streak is long enough to list.
          </li>
        </ul>
      </section>

      <section className="panel about__panel" aria-labelledby="streaks-score">
        <h2 id="streaks-score">How streaks change the probability</h2>
        <p className="panel-lede">
          The lean is a score that ends up between roughly 28% and 78% chance of a higher close
          (intentionally not 0% or 100%). Streak rules add or subtract fixed amounts to that score
          before other factors layer on.
        </p>
        <p className="panel-lede" style={{ marginTop: "0.85rem", marginBottom: "0.35rem" }}>
          <strong>Live session lean (SPY desk and per-stock desk)</strong>
        </p>
        <ul className="about__list">
          <li>
            <strong>2 consecutive down days</strong> — score +0.03 (about three percentage points
            more odds toward higher).
          </li>
          <li>
            <strong>3 or more consecutive down days</strong> — score +0.055 (stronger mean-reversion
            tilt).
          </li>
          <li>
            <strong>4 or more consecutive up days</strong> — score −0.035 (cooling lean).
          </li>
          <li>
            A 1-day down or a short 2–3 day up streak does <strong>not</strong> apply those score
            nudges (they may still appear in lists at different thresholds — see below).
          </li>
        </ul>
        <p className="panel-lede" style={{ marginTop: "0.85rem", marginBottom: "0.35rem" }}>
          <strong>Next-session / “next 5 sessions” calendar lean</strong>
        </p>
        <p className="panel-lede">
          Tomorrow and the next few trading days use a thinner model (more calendar, less live
          tape). Streaks still matter, with slightly smaller weights:
        </p>
        <ul className="about__list">
          <li>
            <strong>2 down days</strong> into the open → +0.025 to the forward lean score.
          </li>
          <li>
            <strong>3+ down days</strong> → +0.04.
          </li>
          <li>
            <strong>4+ up days</strong> → −0.025.
          </li>
        </ul>
        <p className="about__disclaimer">
          These points are deliberately modest. Calendar edges, ES / VIX tone, breadth, yields, oil/
          gold shocks (on SPY), and a stock’s own weekday or month history can outweigh the streak
          on any given day.
        </p>
      </section>

      <section className="panel about__panel" aria-labelledby="streaks-factors">
        <h2 id="streaks-factors">What you see under “Why this signal”</h2>
        <p className="panel-lede">
          Factors only show when the streak is long enough. That keeps the list readable and focused
          on runs that actually shifted the score (or at least crossed our listing cutoffs).
        </p>
        <ul className="about__list">
          <li>
            <strong>SPY — down streak</strong> — listed when there are{" "}
            <strong>2 or more</strong> consecutive down days. Label example: “3 consecutive SPY down
            days.” Detail includes a decade-scale (about 10 years of SPY sessions) historical rate:
            after a down day, how often the next session closed higher, and sample size n.
          </li>
          <li>
            <strong>SPY — up streak</strong> — listed when there are{" "}
            <strong>3 or more</strong> consecutive up days (score only bites at 4+, so the list can
            surface a run one step early as context). Supports a lower-close lean; note that long
            upside streaks often cool.
          </li>
          <li>
            <strong>Individual stocks</strong> — same idea on that ticker’s own closes:
            <ul style={{ margin: "0.4rem 0 0", paddingLeft: "1.1rem" }}>
              <li>Down streak listed at ≥2 days, with win-rate after down days from that name’s ~1y sample when available.</li>
              <li>Up streak listed at ≥4 days (matches the score threshold for equities).</li>
            </ul>
          </li>
          <li>
            <strong>Supports</strong> — a down-streak factor “supports” a higher-close lean; an
            up-streak factor “supports” a lower-close lean. If the overall arrow agrees with those
            factors, confidence can tick up; if other factors disagree, the lean can still go the
            opposite way.
          </li>
        </ul>
      </section>

      <section className="panel about__panel" aria-labelledby="streaks-after">
        <h2 id="streaks-after">“After a down day…” history</h2>
        <p className="panel-lede">
          When a down streak is long enough to list, we attach a second piece of history — not the
          streak length itself, but a simple conditional:
        </p>
        <ul className="about__list">
          <li>
            Look at many past sessions where the day finished lower.
          </li>
          <li>
            Measure how often the <strong>following</strong> session finished higher.
          </li>
          <li>
            Report that as a win rate and sample size (and show the average next-day move in other
            internal stats used for historical cards).
          </li>
        </ul>
        <p className="panel-lede" style={{ marginTop: "0.65rem" }}>
          <strong>SPY</strong> uses a deep sample (~2,520 sessions — about 10 years of trading days)
          for those conditionals. <strong>Single names</strong> use the history we have on hand
          (typically about a year of free daily bars when the Mag7 / quote history fills in). Shorter
          samples are noisier; we still show them when n is positive so you can see the backdrop.
        </p>
        <p className="about__disclaimer">
          A historical “finished higher X% of the time after down days” is descriptive — not a
          promise that today’s reversion will match the average.
        </p>
      </section>

      <section className="panel about__panel" aria-labelledby="streaks-spy-vs-stock">
        <h2 id="streaks-spy-vs-stock">SPY desk vs stock desk</h2>
        <ul className="about__list">
          <li>
            <strong>SPY / market desk</strong> — streaks are measured on SPY’s own daily closes (the
            same series that drives the base “how often does the market finish higher?” rate). That
            streak sits next to ES futures, VIX, breadth, yields, oil/gold shocks, CPI windows, and
            calendar slices.
          </li>
          <li>
            <strong>Stock desk (ticker lookup / Mag7 history)</strong> — streaks are measured on{" "}
            <em>that stock’s</em> daily closes, not SPY’s. A three-day Apple drawdown is Apple’s
            streak; SPY can be on a different path at the same time. Relative 5-day performance vs
            SPY is a separate factor when it fires.
          </li>
          <li>
            Shared market tone (ES bid/soft, VIX rising/easing) can still lean liquid equity names,
            but the streak counting itself is always the instrument on screen.
          </li>
        </ul>
      </section>

      <section className="panel about__panel" aria-labelledby="streaks-forward">
        <h2 id="streaks-forward">Tomorrow and the next five sessions</h2>
        <p className="panel-lede">
          After the regular session, ArrowBeat often promotes a <strong>next-session lean</strong>{" "}
          built from data known today: weekday of the next session, month, day-of-month / cashflow /
          CPI-style windows when they apply, plus the streak counted through the last completed
          close.
        </p>
        <ul className="about__list">
          <li>
            The current streak is treated as the path <strong>into the open</strong> of that next
            day — we do not invent a mid-week streak for each of the five forward days from fake
            futures prices.
          </li>
          <li>
            The same completed-session up/down streak feeds each day on the “Next 5 sessions” strip
            as a mild modifier while calendar ranks shift by date.
          </li>
          <li>
            Forward leans are intentionally thinner (band roughly 32%–72% higher-close
            probability). Streak is one of the pieces, not the main story.
          </li>
        </ul>
      </section>

      <section className="panel about__panel" aria-labelledby="streaks-limits">
        <h2 id="streaks-limits">What streaks do <em>not</em> do</h2>
        <ul className="about__list">
          <li>
            They are not a trade signal system, not advice, and not a stop-loss rule.
          </li>
          <li>
            They ignore overnight gaps as a separate object — we work off daily closes from free
            delayed quotes.
          </li>
          <li>
            They do not special-case holidays beyond skipping weekends in the forward calendar;
            market holidays are not fully modeled.
          </li>
          <li>
            One-day red sessions do not force a higher lean by themselves; short green runs under
            the thresholds do not force a lower lean for the scored nudge either.
          </li>
          <li>
            Confidence stars still depend on <strong>edge</strong> (how far P(higher) is from 50%)
            and <strong>agreement</strong> among listed factors — streak is only one of those
            factors when it appears.
          </li>
        </ul>
      </section>

      <section className="panel about__panel" aria-labelledby="streaks-glance">
        <h2 id="streaks-glance">Quick reference</h2>
        <ul className="about__list">
          <li>
            <strong>Count</strong> — consecutive green closes (up streak) or red closes (down streak)
            at the tip of the daily history.
          </li>
          <li>
            <strong>Score (live SPY / stock)</strong> — 2 down: +0.03 · 3+ down: +0.055 · 4+ up:
            −0.035.
          </li>
          <li>
            <strong>Score (tomorrow / next 5)</strong> — 2 down: +0.025 · 3+ down: +0.04 · 4+ up:
            −0.025.
          </li>
          <li>
            <strong>List as a factor</strong> — SPY: down ≥2, up ≥3 · Stocks: down ≥2, up ≥4.
          </li>
          <li>
            <strong>SPY down-streak detail</strong> — historical next-day higher rate after down days
            over ~10y SPY.
          </li>
          <li>
            <strong>Stock down-streak detail</strong> — same conditional on that ticker’s available
            daily sample (~1y when full).
          </li>
        </ul>
      </section>

      <section className="panel about__panel" aria-labelledby="streaks-not">
        <h2 id="streaks-not">Educational only</h2>
        <p className="about__disclaimer">
          ArrowBeat is educational. Streak logic is a small, transparent piece of a multi-factor
          probability lean — <strong>not investment advice</strong>, not a guarantee, and not a
          broker. Markets can move against any lean. Quotes may be delayed. Use this as a clearer
          way to read consecutive green and red closes — not as a trading system.
        </p>
        {onGoHome ? (
          <button
            type="button"
            className="about__cta"
            style={{ marginTop: "1rem" }}
            onClick={onGoHome}
          >
            Back to home
          </button>
        ) : null}
      </section>
    </article>
  );
}
