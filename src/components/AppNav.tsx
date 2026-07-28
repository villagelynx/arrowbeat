export type AppView = "home" | "about" | "correction" | "crash";

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
          Dashboard
        </button>
        {onGoScorecard ? (
          <button type="button" className="app-nav__link" onClick={onGoScorecard}>
            Scorecard
          </button>
        ) : null}
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
          className={`app-nav__link ${view === "about" ? "is-active" : ""}`}
          onClick={() => onNavigate("about")}
        >
          About
        </button>
      </div>
    </nav>
  );
}
