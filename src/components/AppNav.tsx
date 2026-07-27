import { useEffect, useId, useRef, useState } from "react";

export type AppView = "home" | "about";

type AppNavProps = {
  view: AppView;
  onNavigate: (view: AppView) => void;
};

export function AppNav({ view, onNavigate }: AppNavProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointer(e: MouseEvent | TouchEvent) {
      const root = rootRef.current;
      if (!root) return;
      if (e.target instanceof Node && !root.contains(e.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
    };
  }, [open]);

  function go(next: AppView) {
    onNavigate(next);
    setOpen(false);
  }

  return (
    <div className={`app-nav ${open ? "is-open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="app-nav__toggle"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="app-nav__bars" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>

      {open ? (
        <nav id={menuId} className="app-nav__panel" aria-label="Site">
          <button
            type="button"
            className={`app-nav__link ${view === "home" ? "is-active" : ""}`}
            onClick={() => go("home")}
          >
            Dashboard
          </button>
          <button
            type="button"
            className={`app-nav__link ${view === "about" ? "is-active" : ""}`}
            onClick={() => go("about")}
          >
            About
          </button>
        </nav>
      ) : null}
    </div>
  );
}
