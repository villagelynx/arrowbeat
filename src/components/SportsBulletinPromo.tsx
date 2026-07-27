import { useEffect, useState } from "react";
import {
  fetchSportsBulletin,
  type SportsBulletin,
} from "../lib/sports-bulletin";

const SITE = "https://sportsin60.com";

/** Format bulletin show date (YYYY-MM-DD) without UTC-midnight → prior local day. */
function formatBulletinDate(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!match) return iso;
  const [, y, m, d] = match;
  // Noon America/New_York keeps the calendar day stable across US zones.
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  }).format(new Date(`${y}-${m}-${d}T12:00:00-04:00`));
}

/**
 * Promotes the Sports in 60 daily avatar bulletin under weekday odds.
 * Soft-fails to a link-only promo if the proxy/metadata fetch fails.
 */
export function SportsBulletinPromo() {
  const [bulletin, setBulletin] = useState<SportsBulletin | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await fetchSportsBulletin();
        if (cancelled) return;
        setBulletin(next);
        setFailed(false);
      } catch {
        if (cancelled) return;
        setBulletin(null);
        setFailed(true);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) return null;

  const videoUrl = bulletin?.videoUrl ?? null;
  const posterUrl = bulletin?.posterUrl ?? undefined;
  const dateLabel = bulletin ? formatBulletinDate(bulletin.date) : null;

  return (
    <section className="panel panel--bulletin" aria-labelledby="bulletin-title">
      <div className="bulletin__head">
        <h2 id="bulletin-title">Sports in 60 · Daily bulletin</h2>
        <p className="panel-lede">
          One-minute world sports desk
          {dateLabel ? ` · ${dateLabel}` : ""}. Fresh when Sports in 60
          publishes — watch here or on the site.
        </p>
      </div>

      {videoUrl ? (
        <div className="bulletin__player">
          <video
            key={videoUrl}
            className="bulletin__video"
            controls
            playsInline
            preload="metadata"
            poster={posterUrl}
            src={videoUrl}
          >
            Your browser does not support embedded video.{" "}
            <a href={SITE} target="_blank" rel="noreferrer">
              Watch on sportsin60.com
            </a>
          </video>
        </div>
      ) : (
        <p className="bulletin__fallback">
          {failed
            ? "Couldn’t load today’s bulletin metadata."
            : "Video not attached to the latest bulletin yet."}{" "}
          Open Sports in 60 for the full desk.
        </p>
      )}

      <p className="bulletin__cta">
        <a href={SITE} target="_blank" rel="noreferrer">
          sportsin60.com →
        </a>
      </p>
    </section>
  );
}
