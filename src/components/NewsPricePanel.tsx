import type { NewsImpactItem, NewsPricePayload } from "../lib/news-price";

type NewsPricePanelProps = {
  symbol: string;
  payload: NewsPricePayload | null;
  loading: boolean;
  error: string | null;
};

function pctClass(n: number | null): string {
  if (n == null) return "";
  if (n > 0) return "is-up";
  if (n < 0) return "is-down";
  return "";
}

function fmtPct(n: number | null): string {
  if (n == null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function formatDay(isoDate: string | null): string {
  if (!isoDate) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(new Date(`${isoDate}T12:00:00-04:00`));
  } catch {
    return isoDate;
  }
}

function NewsRow({ item }: { item: NewsImpactItem }) {
  const headline = item.link ? (
    <a href={item.link} target="_blank" rel="noopener noreferrer" className="news-impact__title">
      {item.title}
    </a>
  ) : (
    <span className="news-impact__title">{item.title}</span>
  );

  return (
    <li className="news-impact__item">
      <div className="news-impact__meta">
        <span className="news-impact__pub">{item.publisher}</span>
        <span className="news-impact__date" title={item.publishedAt}>
          {formatDay(item.publishDate)}
        </span>
      </div>
      {headline}
      {item.summary ? <p className="news-impact__summary">{item.summary}</p> : null}
      <div className="news-impact__moves" aria-label="Session moves around headline">
        <span className="news-impact__move">
          <span className="news-impact__move-label">Session</span>
          <span className={`news-impact__move-pct ${pctClass(item.sameSessionPct)}`}>
            {fmtPct(item.sameSessionPct)}
          </span>
          {item.eventDate ? (
            <span className="news-impact__move-sub">{formatDay(item.eventDate)}</span>
          ) : null}
        </span>
        <span className="news-impact__move">
          <span className="news-impact__move-label">Next</span>
          <span className={`news-impact__move-pct ${pctClass(item.nextSessionPct)}`}>
            {fmtPct(item.nextSessionPct)}
          </span>
        </span>
        <span className="news-impact__move">
          <span className="news-impact__move-label">+3d</span>
          <span className={`news-impact__move-pct ${pctClass(item.window3Pct)}`}>
            {fmtPct(item.window3Pct)}
          </span>
        </span>
      </div>
    </li>
  );
}

/** Headlines co-located with session closes for the active desk name. */
export function NewsPricePanel({ symbol, payload, loading, error }: NewsPricePanelProps) {
  return (
    <section className="panel panel--news desk-row" aria-labelledby="news-price-title">
      <h2 id="news-price-title">News around price · {symbol}</h2>
      <p className="panel-lede">
        Recent Yahoo headlines and a short story teaser, with same-session, next-session, and
        +3-session close moves. Co-movement only — not causal proof; full text lives on Yahoo.
      </p>

      {loading ? <p className="news-impact__status">Loading headlines…</p> : null}
      {!loading && error ? <p className="news-impact__status is-error">{error}</p> : null}

      {!loading && payload?.items?.length ? (
        <ul className="news-impact__list">
          {payload.items.map((item) => (
            <NewsRow key={item.id} item={item} />
          ))}
        </ul>
      ) : null}

      {!loading && !error && payload && !payload.items.length ? (
        <p className="news-impact__status">No recent headlines for {symbol}.</p>
      ) : null}

      <p className="news-impact__disclaimer">
        {payload?.disclaimer ??
          "Educational co-location only. Free Yahoo data — not investment advice."}
      </p>
    </section>
  );
}
