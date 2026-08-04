export type AppView =
  | "home"
  | "about"
  | "streaks"
  | "correction"
  | "crash"
  | "cpi"
  | "stock-corrections";

type AppNavProps = {
  view: AppView;
  onNavigate: (view: AppView) => void;
  onGoScorecard?: () => void;
};

export function AppNav({ view, onNavigate, onGoScorecard }: AppNavProps) {
  return (
    <nav className="app-nav" aria-label="Site">
      <div className="app-nav__links">
        <button
          type="button"
          className={`app-nav__link ${view === "home" ? "is-active" : ""}`}
          onClick={() => onNavigate("home")}
        >
          Home
        </button>
        {onGoScorecard ? (
          <button type="button" className="app-nav__link" onClick={onGoScorecard}>
            Scorecard
          </button>
        ) : null}
        <button
          type="button"
          className={`app-nav__link ${view === "streaks" ? "is-active" : ""}`}
          onClick={() => onNavigate("streaks")}
        >
          Streaks
        </button>
        <button
          type="button"
          className={`app-nav__link ${view === "stock-corrections" ? "is-active" : ""}`}
          onClick={() => onNavigate("stock-corrections")}
        >
          Stock corrections
        </button>
        <button
          type="button"
          className={`app-nav__link ${view === "correction" ? "is-active" : ""}`}
          onClick={() => onNavigate("correction")}
        >
          Correction odds
        </button>
        <button
          type="button"
          className={`app-nav__link ${view === "crash" ? "is-active" : ""}`}
          onClick={() => onNavigate("crash")}
        >
          Crash odds
        </button>
        <button
          type="button"
          className={`app-nav__link ${view === "cpi" ? "is-active" : ""}`}
          onClick={() => onNavigate("cpi")}
        >
          CPI odds
        </button>
        <button
          type="button"
          className={`app-nav__link ${view === "about" ? "is-active" : ""}`}
          onClick={() => onNavigate("about")}
        >
          About
        </button>
      </div>
    </nav>
  );
}
