import type { CpiWindowInsight } from "../lib/cpi-calendar";

type Props = {
  insight: CpiWindowInsight;
  /** Dashboard embed vs dedicated page layout. */
  variant?: "dashboard" | "page";
  onOpenFullPage?: () => void;
};

export function CpiOddsPanel({
  insight,
  variant = "dashboard",
  onOpenFullPage,
}: Props) {
  const titleId = variant === "page" ? "cpi-panel-title" : "cpi-title";
  const todayLabel =
    insight.odds.find((o) => o.kind === insight.todayKind)?.label ?? "Quiet";

  return (
    <section
      className={`panel${variant === "page" ? " panel--correction-page" : ""}`}
      aria-labelledby={titleId}
    >
      <div className="corr-odds__head">
        <h2 id={titleId}>
          {variant === "page" ? "Current snapshot" : "CPI release window odds"}
        </h2>
        {variant === "dashboard" && onOpenFullPage ? (
          <a
            href="#cpi"
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
        ~10y SPY around mid-month inflation prints — ranked by historical higher-close rate. Proxy:
        weekday nearest the 12th (not official BLS dates).
      </p>

      <div className="cashflow cpi-window">
        <p className="cashflow__title">Inflation print window</p>
        <div className="cashflow__grid">
          <div
            className={`cashflow__card ${
              insight.windowVsQuietPts >= 0 ? "is-payday" : "is-rent"
            }`}
          >
            <p className="cashflow__kicker">Window vs quiet</p>
            <p className="cashflow__num">
              {insight.windowVsQuietPts >= 0 ? "+" : ""}
              {insight.windowVsQuietPts.toFixed(1)}
              <span className="cashflow__unit"> pts</span>
            </p>
            <p className="cashflow__note">eve / day / +1 / +2 vs other days</p>
          </div>
          <div
            className={`cashflow__card ${
              insight.todayKind !== "quiet" ? "is-rent" : "is-payday"
            }`}
          >
            <p className="cashflow__kicker">Today</p>
            <p className="cashflow__num cashflow__num--sm">{todayLabel}</p>
            <p className="cashflow__note">Next proxy {insight.nextCpi ?? "—"}</p>
          </div>
        </div>
        <p className="cashflow__spread">
          CPI weeks are when inflation headlines hit — history can lean either way. Treat the ranks
          as a calendar lens, not a forecast.
        </p>
      </div>

      <ol className="odds-rank">
        {insight.odds.map((row) => {
          const leanUp = row.upPct >= 50;
          const isToday = insight.todayKind === row.kind;
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
  );
}
