import type { Bias } from "../lib/signal";

type Props = {
  bias: Bias;
  className?: string;
};

/** Giant directional arrow — the product's visual heartbeat. */
export function MarketArrow({ bias, className = "" }: Props) {
  const up = bias === "up";
  return (
    <svg
      className={`market-arrow ${up ? "is-up" : "is-down"} ${className}`}
      viewBox="0 0 240 320"
      role="img"
      aria-label={up ? "Green arrow — higher-close bias" : "Red arrow — lower-close bias"}
    >
      <defs>
        <linearGradient id="arrowFill" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={up ? "#5dffa8" : "#ff8a7a"} />
          <stop offset="55%" stopColor={up ? "#12d46b" : "#ef3340"} />
          <stop offset="100%" stopColor={up ? "#0a8f48" : "#a51020"} />
        </linearGradient>
        <filter id="arrowGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        filter="url(#arrowGlow)"
        fill="url(#arrowFill)"
        d={
          up
            ? "M120 28 L210 150 H168 V292 H72 V150 H30 Z"
            : "M120 292 L30 170 H72 V28 H168 V170 H210 Z"
        }
      />
    </svg>
  );
}
