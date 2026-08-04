import { useEffect, useState } from "react";
import type { DailySignal, TomorrowSignal } from "../lib/signal";
import {
  formatCountdown,
  getMorningBriefGate,
  type MorningBriefGate,
} from "../lib/morning-brief";
import {
  resolveDisplayedTomorrowLean,
} from "../lib/tomorrow-lean-publish";

type MorningBriefPageProps = {
  signal: DailySignal | null;
  loading?: boolean;
  onGoHome?: () => void;
};

function useBriefGate(): MorningBriefGate {
  const [gate, setGate] = useState(() => getMorningBriefGate());
  useEffect(() => {
    const id = window.setInterval(() => setGate(getMorningBriefGate()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return gate;
}

function stars(n: 1 | 2 | 3 | 4 | 5): string {
  return "★".repeat(n) + "☆".repeat(5 - n);
}

function formatDay(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${iso}T12:00:00-04:00`));
}

function ForwardMini({ days }: { days: TomorrowSignal[] }) {
  if (!days.length) return null;
  return (
    <ol className="brief-forward" aria-label="Next five sessions">
      {days.slice(0, 5).map((day, idx) => {
        const up = day.bias === "up";
        const lead = up ? day.probabilityHigher : day.probabilityLower;
        const label = new Intl.DateTimeFormat("en-US", {
          timeZone: "America/New_York",
          weekday: "short",
        }).format(new Date(`${day.asOfDate}T12:00:00-04:00`));
        return (
          <li key={day.asOfDate} className={up ? "is-up" : "is-down"}>
            <span>{idx === 0 ? "Next" : label}</span>
            <strong>
              {up ? "▲" : "▼"} {lead.toFixed(0)}%
            </strong>
          </li>
        );
      })}
    </ol>
  );
}

export function MorningBriefPage({ signal, loading, onGoHome }: MorningBriefPageProps) {
  const gate = useBriefGate();
  const tomorrow = resolveDisplayedTomorrowLean(signal?.tomorrow ?? null, new Date());

  if (!gate.released) {
    return (
      <article className="about brief" aria-labelledby="brief-title">
        <header className="about__hero">
          <p className="about__kicker">ArrowBeat · morning brief</p>
          <h1 id="brief-title" className="about__title">
            Brief drops at {gate.releaseLabel}
          </h1>
          <p className="about__lede">
            Each trading day&apos;s written lean unlocks at <strong>5:00 AM Eastern</strong>. Until
            then, the live desk still updates on Home — this page holds the daily package for a
            clean morning read.
          </p>
          <p className="brief-countdown" aria-live="polite">
            Unlocks in <strong>{formatCountdown(gate.msUntilRelease)}</strong>
          </p>
          <p className="about__disclaimer">
            {formatDay(gate.sessionDate)} · America/New_York calendar
          </p>
          {onGoHome ? (
            <button type="button" className="about__cta" onClick={onGoHome}>
              Open live desk
            </button>
          ) : null}
        </header>

        <section className="panel about__panel">
          <h2>What unlocks at 5 AM ET</h2>
          <ul className="about__list">
            <li>Today&apos;s higher-close lean and probability for SPY</li>
            <li>Top factors behind the lean</li>
            <li>Next five session calendar path</li>
            <li>Tomorrow&apos;s thinner lean when available</li>
          </ul>
        </section>
      </article>
    );
  }

  if (loading || !signal) {
    return (
      <article className="about brief">
        <header className="about__hero">
          <p className="about__kicker">ArrowBeat · morning brief</p>
          <h1 className="about__title">Loading today&apos;s brief…</h1>
        </header>
      </article>
    );
  }

  const up = signal.bias === "up";
  const lead = up ? signal.probabilityHigher : signal.probabilityLower;
  const topFactors = signal.factors.slice(0, 5);
  const tmr = tomorrow?.lean ?? signal.tomorrow;
  const tmrUp = tmr?.bias === "up";
  const tmrLead = tmr
    ? tmrUp
      ? tmr.probabilityHigher
      : tmr.probabilityLower
    : null;

  return (
    <article className="about brief" aria-labelledby="brief-title">
      <header className="about__hero">
        <p className="about__kicker">Morning brief · unlocked {gate.releaseLabel}</p>
        <h1 id="brief-title" className="about__title">
          {formatDay(signal.asOfDate)}
        </h1>
        <p className="about__lede">
          S&amp;P 500 (SPY) higher-close lean for the session — educational probability, not advice.
        </p>
        {onGoHome ? (
          <button type="button" className="about__cta" onClick={onGoHome}>
            Open live desk
          </button>
        ) : null}
      </header>

      <section className={`panel about__panel brief-hero ${up ? "is-up" : "is-down"}`}>
        <p className="brief-hero__kicker">{signal.sessionLabel}</p>
        <p className="brief-hero__arrow" aria-hidden="true">
          {up ? "▲" : "▼"}
        </p>
        <p className="brief-hero__pct">
          {lead.toFixed(1)}
          <span>%</span>
        </p>
        <p className="brief-hero__chip">{up ? "Higher-close lean" : "Lower-close lean"}</p>
        <p className="brief-hero__conf">
          {stars(signal.confidence)} · {signal.confidenceLabel}
        </p>
      </section>

      {topFactors.length ? (
        <section className="panel about__panel" aria-labelledby="brief-factors">
          <h2 id="brief-factors">Why this lean</h2>
          <ul className="about__list">
            {topFactors.map((f) => (
              <li key={f.id}>
                <strong>{f.label}</strong>
                <span className="brief-factor-detail"> — {f.detail}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {signal.forwardLeans?.length ? (
        <section className="panel about__panel" aria-labelledby="brief-forward">
          <h2 id="brief-forward">Next 5 sessions</h2>
          <p className="panel-lede">Calendar / historical path — thinner than today&apos;s live lean.</p>
          <ForwardMini days={signal.forwardLeans} />
        </section>
      ) : null}

      {tmr && tmrLead != null ? (
        <section className="panel about__panel" aria-labelledby="brief-tmr">
          <h2 id="brief-tmr">{tmr.skippedWeekend ? "Next session lean" : "Tomorrow&apos;s lean"}</h2>
          <p className="panel-lede">
            {tmrUp ? "Higher" : "Lower"} {tmrLead.toFixed(1)}% · {tmr.confidenceLabel}
          </p>
        </section>
      ) : null}

      <p className="about__disclaimer">
        Free delayed Yahoo data · educational only · not investment advice. Live desk may refresh
        intraday after this morning pack.
      </p>
    </article>
  );
}
