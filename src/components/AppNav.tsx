import { useEffect, useId, useRef, useState } from "react";

export type AppView =
  | "home"
  | "about"
  | "model"
  | "streaks"
  | "brief"
  | "widget"
  | "correction"
  | "crash"
  | "cpi"
  | "stock-corrections";

type AppNavProps = {
  view: AppView;
  onNavigate: (view: AppView) => void;
  onGoScorecard?: () => void;
};

type NavItem = {
  id: string;
  label: string;
  view?: AppView;
  action?: "scorecard";
};

const NAV_ITEMS: NavItem[] = [
  { id: "home", label: "Home", view: "home" },
  { id: "brief", label: "Morning brief", view: "brief" },
  { id: "scorecard", label: "Scorecard", action: "scorecard" },
  { id: "widget", label: "Widget", view: "widget" },
  { id: "model", label: "Model", view: "model" },
  { id: "streaks", label: "Streaks", view: "streaks" },
  { id: "stock-corrections", label: "Stock corrections", view: "stock-corrections" },
  { id: "correction", label: "Correction odds", view: "correction" },
  { id: "crash", label: "Crash odds", view: "crash" },
  { id: "cpi", label: "CPI odds", view: "cpi" },
  { id: "about", label: "About", view: "about" },
];

export function AppNav({ view, onNavigate, onGoScorecard }: AppNavProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointer(e: MouseEvent) {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
      document.body.style.overflow = prev;
    };
  }, [open]);

  function go(item: NavItem) {
    if (item.action === "scorecard") {
      onGoScorecard?.();
      setOpen(false);
      return;
    }
    if (item.view) {
      onNavigate(item.view);
      setOpen(false);
    }
  }

  return (
    <nav className="app-nav" aria-label="Site">
      <div className="app-nav__bar">
        <p className="app-nav__kicker">Menu</p>
        <button
          ref={buttonRef}
          type="button"
          className={`app-nav__burger${open ? " is-open" : ""}`}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="app-nav__burger-lines" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>
      </div>

      {open ? (
        <button
          type="button"
          className="app-nav__scrim"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <div
        ref={menuRef}
        id={panelId}
        className={`app-nav__drawer${open ? " is-open" : ""}`}
        hidden={!open}
      >
        <p className="app-nav__drawer-title">ArrowBeat</p>
        <ul className="app-nav__drawer-list">
          {NAV_ITEMS.map((item) => {
            if (item.action === "scorecard" && !onGoScorecard) return null;
            const active = item.view != null && item.view === view;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={`app-nav__drawer-link${active ? " is-active" : ""}`}
                  onClick={() => go(item)}
                >
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
