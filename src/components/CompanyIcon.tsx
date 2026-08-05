import { useEffect, useState } from "react";
import {
  faviconUrlForSymbol,
  lettermarkForSymbol,
  logoUrlForSymbol,
} from "../lib/company-logos";

type CompanyIconProps = {
  symbol: string;
  /** Visual size in px (CSS). */
  size?: number;
  className?: string;
  /** Hide decorative icons from AT. */
  decorative?: boolean;
};

type Stage = "logo" | "favicon" | "letter";

/**
 * Corporate icon for a ticker. Free CDN logos with favicon + lettermark fallbacks.
 */
export function CompanyIcon({
  symbol,
  size = 20,
  className = "",
  decorative = true,
}: CompanyIconProps) {
  const label = symbol.trim().toUpperCase() || "?";
  const [stage, setStage] = useState<Stage>("logo");

  // Re-try Parqet whenever the desk ticker changes (failed lookups must not stick).
  useEffect(() => {
    setStage("logo");
  }, [label]);

  const favicon = faviconUrlForSymbol(label, Math.max(64, size * 2));

  if (stage === "letter" || !label) {
    return (
      <span
        className={`company-icon company-icon--letter ${className}`.trim()}
        style={{ width: size, height: size, fontSize: Math.max(10, size * 0.45) }}
        aria-hidden={decorative ? true : undefined}
        aria-label={decorative ? undefined : `${label} logo`}
      >
        {lettermarkForSymbol(label)}
      </span>
    );
  }

  const src =
    stage === "logo" ? logoUrlForSymbol(label, Math.max(64, size * 2)) : favicon!;

  return (
    <img
      key={`${label}-${stage}`}
      className={`company-icon ${className}`.trim()}
      src={src}
      alt={decorative ? "" : `${label} logo`}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        setStage((prev) => {
          if (prev === "logo" && favicon) return "favicon";
          return "letter";
        });
      }}
    />
  );
}
