import { useMemo, useState } from "react";
import { WIDGET_PRESET_SYMBOLS } from "./EmbedWidget";

type WidgetPageProps = {
  onGoHome?: () => void;
};

export function WidgetPage({ onGoHome }: WidgetPageProps) {
  const [symbol, setSymbol] = useState("SPY");
  const [compact, setCompact] = useState(false);
  const [copied, setCopied] = useState(false);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://arrowbeat.com";

  const embedUrl = useMemo(() => {
    const u = new URL(origin);
    u.searchParams.set("embed", "1");
    u.searchParams.set("symbol", symbol.trim().toUpperCase() || "SPY");
    if (compact) u.searchParams.set("compact", "1");
    return u.toString();
  }, [origin, symbol, compact]);

  const width = compact ? 280 : 320;
  const height = compact ? 168 : 210;

  const snippet = useMemo(
    () =>
      `<iframe\n  src="${embedUrl}"\n  title="ArrowBeat ${symbol} lean"\n  width="${width}"\n  height="${height}"\n  style="border:0;border-radius:12px;overflow:hidden;max-width:100%;"\n  loading="lazy"\n></iframe>`,
    [embedUrl, symbol, width, height],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <article className="about" aria-labelledby="widget-title">
      <header className="about__hero">
        <p className="about__kicker">ArrowBeat · embed</p>
        <h1 id="widget-title" className="about__title">
          Put ArrowBeat on your site
        </h1>
        <p className="about__lede">
          Free iframe widget for <strong>S&amp;P 500 (SPY)</strong> or a stock lean. Delayed Yahoo
          data, educational probability — not trading signals.
        </p>
        {onGoHome ? (
          <button type="button" className="about__cta" onClick={onGoHome}>
            Back to home
          </button>
        ) : null}
      </header>

      <section className="panel about__panel" aria-labelledby="widget-build">
        <h2 id="widget-build">Build your embed</h2>
        <label className="widget-form__label" htmlFor="widget-symbol">
          Symbol
        </label>
        <div className="widget-form__row">
          <input
            id="widget-symbol"
            className="widget-form__input"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            maxLength={16}
            spellCheck={false}
            autoComplete="off"
          />
          <label className="widget-form__check">
            <input
              type="checkbox"
              checked={compact}
              onChange={(e) => setCompact(e.target.checked)}
            />
            Compact
          </label>
        </div>
        <div className="widget-form__presets" role="group" aria-label="Presets">
          {WIDGET_PRESET_SYMBOLS.map((s) => (
            <button
              key={s}
              type="button"
              className={`quote-chip${symbol === s ? " is-on" : ""}`}
              onClick={() => setSymbol(s)}
            >
              {s}
            </button>
          ))}
        </div>

        <p className="widget-form__label">Preview</p>
        <div className="widget-preview">
          <iframe
            title={`ArrowBeat ${symbol} preview`}
            src={embedUrl}
            width={width}
            height={height}
            style={{ border: 0, borderRadius: 12, maxWidth: "100%" }}
          />
        </div>

        <p className="widget-form__label">Embed code</p>
        <pre className="widget-snippet">{snippet}</pre>
        <button type="button" className="about__cta" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy embed code"}
        </button>
      </section>

      <section className="panel about__panel">
        <h2>Rules of the road</h2>
        <ul className="about__list">
          <li>
            Always keep the ArrowBeat link and “not advice / delayed data” line visible (included in
            the widget footer).
          </li>
          <li>
            Data is free Yahoo delayed (~15 minutes) — refresh comes from the live site on load.
          </li>
          <li>
            Works on HTTPS pages. Prefer iframe width ≥280px so the lean and disclaimer stay readable.
          </li>
        </ul>
      </section>
    </article>
  );
}
