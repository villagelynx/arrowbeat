import type { PredictionRecord } from "../lib/scorecard";

type ScorePredictionListProps = {
  rows: PredictionRecord[];
  ariaLabel: string;
};

function dateLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${iso}T12:00:00-04:00`));
}

export function ScorePredictionList({ rows, ariaLabel }: ScorePredictionListProps) {
  if (!rows.length) {
    return <p className="score-list-empty">No settled days yet — hits and misses will show here.</p>;
  }

  return (
    <ol className="score-list" aria-label={ariaLabel}>
      {rows.map((row) => {
        const verdict =
          row.outcome === "flat" ? "flat" : row.correct ? "hit" : "miss";
        const errorPct =
          row.outcome === "up" || row.outcome === "down"
            ? Math.abs(row.probabilityHigher - (row.outcome === "up" ? 100 : 0))
            : null;
        return (
          <li
            key={row.date}
            className={
              verdict === "hit" ? "is-hit" : verdict === "miss" ? "is-miss" : "is-flat"
            }
          >
            <span className="score-list__date">{dateLabel(row.date)}</span>
            <span className="score-list__pred">Pred {row.bias === "up" ? "▲" : "▼"}</span>
            <span className="score-list__act">
              {row.outcome === "flat"
                ? "Flat"
                : `${row.outcome === "up" ? "▲" : "▼"} ${
                    row.changePct != null && row.changePct >= 0 ? "+" : ""
                  }${row.changePct?.toFixed(2) ?? "—"}%`}
            </span>
            <span
              className="score-list__err"
              title="Absolute error vs P(higher) and outcome"
            >
              {errorPct != null ? `Err ${errorPct.toFixed(0)}%` : "Err —"}
            </span>
            <span className="score-list__verdict">{verdict}</span>
          </li>
        );
      })}
    </ol>
  );
}
