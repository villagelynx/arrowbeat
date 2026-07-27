import { useEffect, useState } from "react";
import { MarketArrow } from "./components/MarketArrow";
import { SpyDayChart } from "./components/SpyDayChart";
import { SpyYearChart } from "./components/SpyYearChart";
import { fetchMarketSnapshot, type Bar, type IntradayBar } from "./lib/market-data";
import {
  buildDemoSignal,
  buildLiveSignal,
  weekdayIndexForIso,
  monthIndexForIso,
  dayOfMonthForIso,
  cashflowKindForDay,
  taxSeasonKindForMonth,
  type DailySignal,
  type CalendarEdgeSlice,
} from "./lib/signal";
import { emptyScorecard, syncScorecard, type ScorecardSummary } from "./lib/scorecard";
import { yearFromIso } from "./lib/spy-ytd";
import "./App.css";

function edgeLabel(pts: number) {
  const sign = pts > 0 ? "+" : "";
  return `${sign}${pts.toFixed(1)}`;
}

function CalendarEdgeChip({ slice, kind }: { slice: CalendarEdgeSlice; kind: string }) {
  const lean = slice.edgePts >= 0 ? "is-up" : "is-down";
  return (
    <li className={lean}>
      <span className="cal-edge__kind">{kind}</span>
      <span className="cal-edge__label">{slice.label}</span>
      <span className="cal-edge__pts">{edgeLabel(slice.edgePts)} pts</span>
      <span className="cal-edge__rank">
        #{slice.rank}/{slice.of}
      </span>
    </li>
  );
}

function stars(n: number) {
  return Array.from({ length: 5 }, (_, i) => (
    <span key={i} className={i < n ? "star is-on" : "star"} aria-hidden="true">
      ★
    </span>
  ));
}

export default function App() {
  const [signal, setSignal] = useState<DailySignal | null>(null);
  const [spyBars, setSpyBars] = useState<Bar[]>([]);
  const [dayBars, setDayBars] = useState<IntradayBar[]>([]);
  const [dayPrevClose, setDayPrevClose] = useState<number | null>(null);
  const [scorecard, setScorecard] = useState<ScorecardSummary>(() => emptyScorecard(""));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const snap = await fetchMarketSnapshot();
        if (cancelled) return;
        const live = buildLiveSignal(snap);
        const bars = snap.spy.bars.length ? snap.spy.bars : snap.spy.recentBars;
        setSignal(live);
        setSpyBars(bars);
        setDayBars(snap.spy.dayBars ?? []);
        setDayPrevClose(snap.spy.dayPrevClose ?? null);
        setScorecard(syncScorecard(live, bars));
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load market data.");
        const demo = buildDemoSignal();
        setSignal(demo);
        setSpyBars([]);
        setDayBars([]);
        setDayPrevClose(null);
        setScorecard(syncScorecard(demo, []));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!signal) {
    return (
      <div className="app theme-up">
        <div className="atmosphere" aria-hidden="true" />
        <header className="topbar">
          <p className="brand">
            Arrow<span>Beat</span>
          </p>
          <p className="brand-tag">Loading market data…</p>
        </header>
      </div>
    );
  }

  const up = signal.bias === "up";
  const leadPct = up ? signal.probabilityHigher : signal.probabilityLower;

  return (
    <div className={`app ${up ? "theme-up" : "theme-down"}`}>
      <div className="atmosphere" aria-hidden="true" />

      <header className="topbar">
        <p className="brand">
          Arrow<span>Beat</span>
        </p>
        <p className="brand-tag">Daily market probability</p>
        <p className={`data-pill ${signal.dataMode === "live" ? "is-live" : "is-demo"}`}>
          {loading
            ? "Refreshing…"
            : signal.dataMode === "live"
              ? "Live · SPY · ES · VIX"
              : "Demo fallback"}
        </p>
      </header>

      <main>
        {error ? <p className="banner-error">{error}</p> : null}

        <div className="desk-top">
          {dayBars.length > 1 ? (
            <section className="panel panel--day" aria-labelledby="spy-day-title">
              <h2 id="spy-day-title">S&amp;P 500 today</h2>
              <p className="panel-lede">
                Free Yahoo 15-minute bars — typically about 15 minutes delayed.
              </p>
              <SpyDayChart bars={dayBars} prevClose={dayPrevClose} />
            </section>
          ) : null}

          <section className="hero" aria-labelledby="bias-title">
            <div className="hero-head">
              <p className="hero-kicker">{signal.sessionLabel}</p>
              <h1 id="bias-title" className="hero-title">
                Today&apos;s market bias
              </h1>
            </div>

            <div className="hero-signal">
              <div className="arrow-stage">
                <MarketArrow bias={signal.bias} />
              </div>

              <p className="bias-chip">{up ? "Higher-close lean" : "Lower-close lean"}</p>

              <div className="prob-block">
                <p className="prob-label">
                  Probability of {up ? "higher" : "lower"} close
                </p>
                <p className="prob-value">
                  {leadPct.toFixed(1)}
                  <span>%</span>
                </p>
                <div className="prob-meter" role="presentation">
                  <div
                    className="prob-meter__fill"
                    style={{ width: `${Math.min(92, Math.max(8, leadPct))}%` }}
                  />
                </div>
                <p className="prob-split">
                  Higher {signal.probabilityHigher.toFixed(1)}% · Lower{" "}
                  {signal.probabilityLower.toFixed(1)}%
                </p>
              </div>

              <div className="confidence">
                <p className="confidence-label">Confidence</p>
                <p className="confidence-stars" aria-label={`${signal.confidence} of 5`}>
                  {stars(signal.confidence)}
                </p>
                <p className="confidence-text">{signal.confidenceLabel}</p>
              </div>
            </div>

            <aside className="hero-rail">
              {signal.calendarEdge ? (
                <div className="cal-edge" aria-label="Today's calendar edge versus coin flip">
                  <p className="cal-edge__title">
                    Today&apos;s calendar edge{" "}
                    <span
                      className={
                        (signal.calendarEdge.blendPts ?? 0) >= 0 ? "is-up" : "is-down"
                      }
                    >
                      {signal.calendarEdge.blendPts != null
                        ? `${edgeLabel(signal.calendarEdge.blendPts)} pts vs 50%`
                        : ""}
                    </span>
                  </p>
                  <ul className="cal-edge__list">
                    {signal.calendarEdge.weekday ? (
                      <CalendarEdgeChip slice={signal.calendarEdge.weekday} kind="Weekday" />
                    ) : null}
                    {signal.calendarEdge.month ? (
                      <CalendarEdgeChip slice={signal.calendarEdge.month} kind="Month" />
                    ) : null}
                    {signal.calendarEdge.dayOfMonth ? (
                      <CalendarEdgeChip slice={signal.calendarEdge.dayOfMonth} kind="Day" />
                    ) : null}
                  </ul>
                </div>
              ) : null}

              {signal.quotes ? (
                <div className="hero-quotes">
                  <ul className="quote-strip" aria-label="Latest quotes">
                    <li>
                      <span>SPY</span>
                      <strong>{signal.quotes.spy?.toFixed(2) ?? "—"}</strong>
                    </li>
                    <li>
                      <span>ES</span>
                      <strong>{signal.quotes.es?.toFixed(2) ?? "—"}</strong>
                    </li>
                    <li>
                      <span>VIX</span>
                      <strong>{signal.quotes.vix?.toFixed(2) ?? "—"}</strong>
                    </li>
                    <li>
                      <span>10Y</span>
                      <strong>
                        {signal.quotes.tnx != null ? `${signal.quotes.tnx.toFixed(2)}%` : "—"}
                      </strong>
                    </li>
                  </ul>
                  <ul
                    className="quote-strip quote-strip--inflation"
                    aria-label="Inflation and commodities"
                  >
                    <li>
                      <span>B/E 10Y</span>
                      <strong>
                        {signal.quotes.breakeven10y != null
                          ? `${signal.quotes.breakeven10y.toFixed(2)}%`
                          : "—"}
                      </strong>
                    </li>
                    <li>
                      <span>Real 10Y</span>
                      <strong>
                        {signal.quotes.realYield10y != null
                          ? `${signal.quotes.realYield10y.toFixed(2)}%`
                          : "—"}
                      </strong>
                    </li>
                    <li>
                      <span>Oil</span>
                      <strong>
                        {signal.quotes.oil != null ? `$${signal.quotes.oil.toFixed(0)}` : "—"}
                      </strong>
                    </li>
                    <li>
                      <span>Gold</span>
                      <strong>
                        {signal.quotes.gold != null
                          ? `$${Math.round(signal.quotes.gold).toLocaleString()}`
                          : "—"}
                      </strong>
                    </li>
                  </ul>
                </div>
              ) : null}
            </aside>
          </section>

          <section className="panel panel--factors" aria-labelledby="factors-title">
            <h2 id="factors-title">Why this signal</h2>
            <p className="panel-lede">
              Factors from SPY, ES, VIX, breadth, yields, breakevens / real rates, and (when they
              move) oil &amp; gold — still a probability lean, not a crystal ball.
            </p>
            <ul className="factor-list">
              {signal.factors.map((f) => {
                const good = f.supports === signal.bias;
                return (
                  <li key={f.id} className={good ? "is-aligned" : "is-contrary"}>
                    <span className="factor-mark" aria-hidden="true">
                      {good ? "✓" : "✗"}
                    </span>
                    <div>
                      <p className="factor-label">{f.label}</p>
                      <p className="factor-detail">{f.detail}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        {spyBars.length ? (
          <div className="desk-grid desk-grid--ytd desk-row desk-row--ytd">
            <section className="panel" aria-labelledby="spy-chart-title">
              <h2 id="spy-chart-title">S&amp;P 500 this year</h2>
              <p className="panel-lede">SPY daily closes — year to date.</p>
              <SpyYearChart bars={spyBars} year={yearFromIso(signal.asOfDate)} />
            </section>
          </div>
        ) : null}

        <div className="desk-grid desk-grid--pair desk-row desk-row--sessions">
        {signal.lastSessions.length ? (
          <section className="panel" aria-labelledby="recent-title">
            <h2 id="recent-title">Last 10 trading days</h2>
            <p className="panel-lede">SPY close vs prior close — green up, red down.</p>
            <ol className="session-strip">
              {signal.lastSessions.map((day) => {
                const dateLabel = new Intl.DateTimeFormat("en-US", {
                  timeZone: "America/New_York",
                  month: "short",
                  day: "numeric",
                }).format(new Date(`${day.date}T12:00:00-04:00`));
                return (
                  <li
                    key={day.date}
                    className={day.bias === "up" ? "is-up" : "is-down"}
                    title={`${day.date}: ${day.changePct >= 0 ? "+" : ""}${day.changePct.toFixed(2)}%`}
                  >
                    <span className="session-day">{day.weekday}</span>
                    <span className="session-date">{dateLabel}</span>
                    <span className="session-arrow" aria-hidden="true">
                      {day.bias === "up" ? "▲" : "▼"}
                    </span>
                    <span className="session-pct">
                      {day.changePct >= 0 ? "+" : ""}
                      {day.changePct.toFixed(1)}%
                    </span>
                    {day.histUpPct != null ? (
                      <span className="session-hist">
                        Hist {day.histUpPct.toFixed(0)}%
                        {day.histRank != null ? ` · #${day.histRank}` : ""}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </section>
        ) : null}

        <section className="panel" aria-labelledby="score-title">
          <h2 id="score-title">Prediction scorecard</h2>
          <p className="panel-lede">
            Live leans saved on this device, graded when SPY&apos;s close vs prior is known. Hit =
            direction correct. Brier = probability calibration (lower better; coin flip ≈ 0.25).
          </p>
          <div className="stat-grid score-grid">
            <div className="stat-card">
              <p className="stat-kicker">Hit rate</p>
              <p className="stat-num">
                {scorecard.hitRate != null ? `${scorecard.hitRate.toFixed(1)}%` : "—"}
              </p>
              <p className="stat-note">
                {scorecard.settled
                  ? `${scorecard.hits}/${scorecard.settled} settled`
                  : "No settled days yet"}
              </p>
            </div>
            <div className="stat-card">
              <p className="stat-kicker">Brier score</p>
              <p className="stat-num">
                {scorecard.brier != null ? scorecard.brier.toFixed(3) : "—"}
              </p>
              <p className="stat-note">vs ~0.25 coin flip</p>
            </div>
          </div>

          {scorecard.pending ? (
            <p className="score-pending">
              Pending {scorecard.pending.date}: lean{" "}
              <strong>{scorecard.pending.bias === "up" ? "higher" : "lower"}</strong> at{" "}
              {scorecard.pending.bias === "up"
                ? scorecard.pending.probabilityHigher.toFixed(1)
                : scorecard.pending.probabilityLower.toFixed(1)}
              % — settles after that session&apos;s SPY close.
            </p>
          ) : (
            <p className="score-pending">
              {signal.dataMode === "live"
                ? "No open prediction — open ArrowBeat on a weekday before the close to log today's lean."
                : "Scorecard needs live market data to log new predictions."}
            </p>
          )}

          {scorecard.recent.length ? (
            <ol className="score-list">
              {scorecard.recent.map((row) => {
                const dateLabel = new Intl.DateTimeFormat("en-US", {
                  timeZone: "America/New_York",
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                }).format(new Date(`${row.date}T12:00:00-04:00`));
                const verdict =
                  row.outcome === "flat"
                    ? "flat"
                    : row.correct
                      ? "hit"
                      : "miss";
                return (
                  <li
                    key={row.date}
                    className={
                      verdict === "hit" ? "is-hit" : verdict === "miss" ? "is-miss" : "is-flat"
                    }
                  >
                    <span className="score-list__date">{dateLabel}</span>
                    <span className="score-list__pred">
                      Pred {row.bias === "up" ? "▲" : "▼"} {row.probabilityHigher.toFixed(0)}%
                    </span>
                    <span className="score-list__act">
                      {row.outcome === "flat"
                        ? "Flat"
                        : `${row.outcome === "up" ? "▲" : "▼"} ${
                            row.changePct != null && row.changePct >= 0 ? "+" : ""
                          }${row.changePct?.toFixed(2) ?? "—"}%`}
                    </span>
                    <span className="score-list__verdict">{verdict}</span>
                  </li>
                );
              })}
            </ol>
          ) : null}
        </section>
        </div>

        {signal.weekdayOdds.length || signal.monthOdds.length ? (
          <div className="desk-grid desk-grid--pair desk-row desk-row--weekday">
        {signal.weekdayOdds.length ? (
          <section className="panel" aria-labelledby="weekday-title">
            <h2 id="weekday-title">Weekday odds ranked</h2>
            <p className="panel-lede">
              ~10y SPY: how often each weekday closed higher — ranked best historical edge first.
            </p>
            <ol className="odds-rank">
              {signal.weekdayOdds.map((row) => {
                const leanUp = row.upPct >= 50;
                const isToday = weekdayIndexForIso(signal.asOfDate) === row.weekdayIndex;
                return (
                  <li
                    key={row.weekday}
                    className={`${leanUp ? "is-up" : "is-down"}${isToday ? " is-today" : ""}`}
                  >
                    <span className="odds-rank__n">#{row.rank}</span>
                    <div className="odds-rank__body">
                      <p className="odds-rank__name">
                        {row.weekday}
                        {isToday ? <span className="odds-rank__tag"> today</span> : null}
                      </p>
                      <p className="odds-rank__meta">
                        Higher {row.upPct.toFixed(1)}% · Lower {row.downPct.toFixed(1)}% · n=
                        {row.n.toLocaleString()}
                      </p>
                    </div>
                    <div className="odds-rank__stats">
                      <span className="odds-rank__up">{row.upPct.toFixed(1)}%</span>
                      <span className="odds-rank__avg">
                        avg {row.avgMovePct >= 0 ? "+" : ""}
                        {row.avgMovePct.toFixed(2)}%
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ) : null}

        {signal.monthOdds.length ? (
          <section className="panel" aria-labelledby="month-title">
            <h2 id="month-title">Month odds ranked</h2>
            <p className="panel-lede">
              ~10y SPY by calendar month. Watch the tax window: March run-up into April 15.
            </p>

            {signal.taxSeason ? (
              <div className="cashflow tax-season">
                <p className="cashflow__title">Tax season · March → April</p>
                <div className="cashflow__grid">
                  <div className="cashflow__card is-rent">
                    <p className="cashflow__kicker">March · tax run-up</p>
                    <p className="cashflow__num">
                      {signal.taxSeason.march.upPct.toFixed(1)}%
                    </p>
                    <p className="cashflow__note">
                      higher-close · rank #{signal.taxSeason.march.rank}/12
                    </p>
                    <p className="cashflow__days">
                      avg {signal.taxSeason.march.avgMovePct >= 0 ? "+" : ""}
                      {signal.taxSeason.march.avgMovePct.toFixed(2)}% · n=
                      {signal.taxSeason.march.n.toLocaleString()}
                    </p>
                  </div>
                  <div
                    className={`cashflow__card ${
                      signal.taxSeason.april.upPct >= signal.taxSeason.march.upPct
                        ? "is-payday"
                        : "is-rent"
                    }`}
                  >
                    <p className="cashflow__kicker">April · tax due</p>
                    <p className="cashflow__num">
                      {signal.taxSeason.april.upPct.toFixed(1)}%
                    </p>
                    <p className="cashflow__note">
                      higher-close · rank #{signal.taxSeason.april.rank}/12
                    </p>
                    <p className="cashflow__days">
                      avg {signal.taxSeason.april.avgMovePct >= 0 ? "+" : ""}
                      {signal.taxSeason.april.avgMovePct.toFixed(2)}% · n=
                      {signal.taxSeason.april.n.toLocaleString()}
                    </p>
                  </div>
                </div>
                <p className="cashflow__spread">
                  March vs April:{" "}
                  <strong>
                    {signal.taxSeason.spreadPts >= 0 ? "+" : ""}
                    {signal.taxSeason.spreadPts.toFixed(1)} pts
                  </strong>{" "}
                  (negative = March softer — the cash-for-taxes story)
                  {signal.taxSeason.todayKind === "march"
                    ? " — you are in the tax run-up month."
                    : signal.taxSeason.todayKind === "april"
                      ? " — you are in tax-deadline month."
                      : "."}{" "}
                  History, not destiny.
                </p>
              </div>
            ) : null}

            <ol className="odds-rank">
              {signal.monthOdds.map((row) => {
                const leanUp = row.upPct >= 50;
                const isToday = monthIndexForIso(signal.asOfDate) === row.monthIndex;
                const taxKind = taxSeasonKindForMonth(row.monthIndex);
                return (
                  <li
                    key={row.monthIndex}
                    className={`${leanUp ? "is-up" : "is-down"}${isToday ? " is-today" : ""}${
                      taxKind === "march" ? " is-rent" : taxKind === "april" ? " is-payday" : ""
                    }`}
                  >
                    <span className="odds-rank__n">#{row.rank}</span>
                    <div className="odds-rank__body">
                      <p className="odds-rank__name">
                        {row.month}
                        {isToday ? <span className="odds-rank__tag"> now</span> : null}
                        {taxKind === "march" ? (
                          <span className="odds-rank__tag is-rent"> tax run-up</span>
                        ) : null}
                        {taxKind === "april" ? (
                          <span className="odds-rank__tag is-payday"> tax due</span>
                        ) : null}
                      </p>
                      <p className="odds-rank__meta">
                        Higher {row.upPct.toFixed(1)}% · Lower {row.downPct.toFixed(1)}% · n=
                        {row.n.toLocaleString()}
                      </p>
                    </div>
                    <div className="odds-rank__stats">
                      <span className="odds-rank__up">{row.upPct.toFixed(1)}%</span>
                      <span className="odds-rank__avg">
                        avg {row.avgMovePct >= 0 ? "+" : ""}
                        {row.avgMovePct.toFixed(2)}%
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ) : null}
          </div>
        ) : null}

        {signal.dayOfMonthOdds.length || signal.cpiWindow?.odds.length ? (
          <div className="desk-grid desk-grid--pair desk-row desk-row--cashflow">
        {signal.dayOfMonthOdds.length ? (
          <section className="panel" aria-labelledby="dom-title">
            <h2 id="dom-title">Day-of-month odds ranked</h2>
            <p className="panel-lede">
              ~10y SPY by calendar day. Watch the paycheck cycle: 1st &amp; 15th vs the last days
              before rent and mortgages hit.
            </p>

            {signal.cashflowCycle ? (
              <div className="cashflow">
                <p className="cashflow__title">Paycheck vs bills</p>
                <div className="cashflow__grid">
                  <div className="cashflow__card is-payday">
                    <p className="cashflow__kicker">Payday · 1st &amp; 15th</p>
                    <p className="cashflow__num">{signal.cashflowCycle.paydayAvgUpPct.toFixed(1)}%</p>
                    <p className="cashflow__note">
                      avg higher-close · best rank #
                      {signal.cashflowCycle.paydayBestRank}
                    </p>
                    <p className="cashflow__days">
                      {signal.cashflowCycle.paydayRows
                        .map((r) => `${r.label} #${r.rank}`)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="cashflow__card is-rent">
                    <p className="cashflow__kicker">Before rent · 28–31</p>
                    <p className="cashflow__num">{signal.cashflowCycle.rentAvgUpPct.toFixed(1)}%</p>
                    <p className="cashflow__note">
                      avg higher-close · weakest rank #
                      {signal.cashflowCycle.rentWorstRank}
                    </p>
                    <p className="cashflow__days">
                      {signal.cashflowCycle.rentRows
                        .map((r) => `${r.label} #${r.rank}`)
                        .join(" · ")}
                    </p>
                  </div>
                </div>
                <p className="cashflow__spread">
                  Payday window beats late-month by{" "}
                  <strong>
                    {signal.cashflowCycle.spreadPts >= 0 ? "+" : ""}
                    {signal.cashflowCycle.spreadPts.toFixed(1)} pts
                  </strong>{" "}
                  historically
                  {signal.cashflowCycle.todayKind === "payday"
                    ? " — today sits in the payday window."
                    : signal.cashflowCycle.todayKind === "rent"
                      ? " — today sits in the rent-pressure window."
                      : "."}{" "}
                  A liquidity story people tell — not a guarantee.
                </p>
              </div>
            ) : null}

            <ol className="odds-rank odds-rank--compact">
              {signal.dayOfMonthOdds.map((row) => {
                const leanUp = row.upPct >= 50;
                const isToday = dayOfMonthForIso(signal.asOfDate) === row.day;
                const cashKind = cashflowKindForDay(row.day);
                return (
                  <li
                    key={row.day}
                    className={`${leanUp ? "is-up" : "is-down"}${isToday ? " is-today" : ""}${
                      cashKind === "payday" ? " is-payday" : cashKind === "rent" ? " is-rent" : ""
                    }`}
                  >
                    <span className="odds-rank__n">#{row.rank}</span>
                    <div className="odds-rank__body">
                      <p className="odds-rank__name">
                        {row.label}
                        {isToday ? <span className="odds-rank__tag"> today</span> : null}
                        {cashKind === "payday" ? (
                          <span className="odds-rank__tag is-payday"> payday</span>
                        ) : null}
                        {cashKind === "rent" ? (
                          <span className="odds-rank__tag is-rent"> rent due</span>
                        ) : null}
                      </p>
                      <p className="odds-rank__meta">
                        Higher {row.upPct.toFixed(1)}% · Lower {row.downPct.toFixed(1)}% · n=
                        {row.n.toLocaleString()}
                      </p>
                    </div>
                    <div className="odds-rank__stats">
                      <span className="odds-rank__up">{row.upPct.toFixed(1)}%</span>
                      <span className="odds-rank__avg">
                        avg {row.avgMovePct >= 0 ? "+" : ""}
                        {row.avgMovePct.toFixed(2)}%
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ) : null}

        {signal.cpiWindow?.odds.length ? (
          <section className="panel" aria-labelledby="cpi-title">
            <h2 id="cpi-title">CPI release window odds</h2>
            <p className="panel-lede">
              ~10y SPY around mid-month inflation prints — ranked by historical higher-close rate.
              Proxy: weekday nearest the 12th (not official BLS dates).
            </p>

            <div className="cashflow cpi-window">
              <p className="cashflow__title">Inflation print window</p>
              <div className="cashflow__grid">
                <div
                  className={`cashflow__card ${
                    signal.cpiWindow.windowVsQuietPts >= 0 ? "is-payday" : "is-rent"
                  }`}
                >
                  <p className="cashflow__kicker">Window vs quiet</p>
                  <p className="cashflow__num">
                    {signal.cpiWindow.windowVsQuietPts >= 0 ? "+" : ""}
                    {signal.cpiWindow.windowVsQuietPts.toFixed(1)}
                    <span className="cashflow__unit"> pts</span>
                  </p>
                  <p className="cashflow__note">eve / day / +1 / +2 vs other days</p>
                </div>
                <div
                  className={`cashflow__card ${
                    signal.cpiWindow.todayKind !== "quiet" ? "is-rent" : "is-payday"
                  }`}
                >
                  <p className="cashflow__kicker">Today</p>
                  <p className="cashflow__num cashflow__num--sm">
                    {signal.cpiWindow.odds.find((o) => o.kind === signal.cpiWindow!.todayKind)
                      ?.label ?? "Quiet"}
                  </p>
                  <p className="cashflow__note">
                    Next proxy {signal.cpiWindow.nextCpi ?? "—"}
                  </p>
                </div>
              </div>
              <p className="cashflow__spread">
                CPI weeks are when inflation headlines hit — history can lean either way. Treat the
                ranks as a calendar lens, not a forecast.
              </p>
            </div>

            <ol className="odds-rank">
              {signal.cpiWindow.odds.map((row) => {
                const leanUp = row.upPct >= 50;
                const isToday = signal.cpiWindow!.todayKind === row.kind;
                const isWindow = row.kind !== "quiet";
                return (
                  <li
                    key={row.kind}
                    className={`${leanUp ? "is-up" : "is-down"}${isToday ? " is-today" : ""}${
                      isWindow ? " is-cpi" : ""
                    }`}
                  >
                    <span className="odds-rank__n">#{row.rank}</span>
                    <div className="odds-rank__body">
                      <p className="odds-rank__name">
                        {row.label}
                        {isToday ? <span className="odds-rank__tag"> today</span> : null}
                        {isWindow ? <span className="odds-rank__tag is-cpi"> CPI</span> : null}
                      </p>
                      <p className="odds-rank__meta">
                        Higher {row.upPct.toFixed(1)}% · Lower {row.downPct.toFixed(1)}% · n=
                        {row.n.toLocaleString()}
                      </p>
                    </div>
                    <div className="odds-rank__stats">
                      <span className="odds-rank__up">{row.upPct.toFixed(1)}%</span>
                      <span className="odds-rank__avg">
                        avg {row.avgMovePct >= 0 ? "+" : ""}
                        {row.avgMovePct.toFixed(2)}%
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ) : null}
          </div>
        ) : null}

        <div className="desk-grid desk-grid--pair desk-row desk-row--stats">
          <section className="panel" aria-labelledby="history-title">
            <h2 id="history-title">Historical comparison</h2>
            <p className="panel-lede">{signal.historical.sampleLabel}</p>
            <div className="stat-grid">
              <div className="stat-card">
                <p className="stat-kicker">Finished higher</p>
                <p className="stat-num">{signal.historical.winRate.toFixed(1)}%</p>
                <p className="stat-note">n ≈ {signal.historical.n.toLocaleString()}</p>
              </div>
              <div className="stat-card">
                <p className="stat-kicker">Avg. next-day move</p>
                <p className="stat-num">
                  {signal.historical.avgMovePct > 0 ? "+" : ""}
                  {signal.historical.avgMovePct.toFixed(2)}%
                </p>
                <p className="stat-note">SPY sample</p>
              </div>
            </div>
          </section>

          <section className="panel panel--stat" aria-labelledby="decade-title">
            <h2 id="decade-title">Market stat of the day</h2>
            <p className="market-stat">{signal.marketStat}</p>
            <div className="decade">
              <div>
                <p className="decade-label">Up days (~10y SPY)</p>
                <p className="decade-value up">{signal.decadeStats.upPct}%</p>
                <p className="decade-sub">{signal.decadeStats.upDays} days</p>
              </div>
              <div>
                <p className="decade-label">Down days (~10y SPY)</p>
                <p className="decade-value down">{signal.decadeStats.downPct}%</p>
                <p className="decade-sub">{signal.decadeStats.downDays} days</p>
              </div>
            </div>
          </section>
        </div>

        <p className="disclaimer">{signal.disclaimer}</p>
      </main>

      <footer className="footer">
        <p>ArrowBeat · Free Yahoo Finance quotes · Before the opening bell</p>
      </footer>
    </div>
  );
}
