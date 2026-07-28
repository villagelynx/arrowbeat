/**
 * Dynamic OG image (SVG) for signal share links — portrait hero composition.
 *
 * Usage: `/api/og?bias=up&p=58.2&c=4&label=Tomorrow&asof=Jul+28%2C+2026`
 *
 * Share URLs (`?view=share&…`) get crawler-visible `og:image` via the
 * `share-meta` edge function, which points here. Clients also attach a PNG
 * via Web Share / download.
 *
 * Note: some messengers prefer PNG/JPEG for previews; SVG still works for
 * many crawlers and matches the attached portrait PNG composition.
 */

type NetlifyEvent = {
  queryStringParameters?: Record<string, string | undefined> | null;
};

type NetlifyResult = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

const FONT =
  "Inter,system-ui,Helvetica Neue,Helvetica,Arial,sans-serif";

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function handler(event: NetlifyEvent): Promise<NetlifyResult> {
  const q = event.queryStringParameters ?? {};
  const biasRaw = (q.bias ?? "up").toLowerCase();
  const up = biasRaw !== "down" && biasRaw !== "d";
  const p = clamp(Number.parseFloat(q.p ?? "50") || 50, 0, 99.9);
  const c = clamp(Math.round(Number.parseFloat(q.c ?? "3") || 3), 1, 5);
  const label = escapeXml((q.label ?? "Today").slice(0, 40));
  const asofRaw = (q.asof ?? "").trim().slice(0, 64);
  const asof = asofRaw ? escapeXml(asofRaw) : "";
  const signal = up ? "#12d46b" : "#ef3340";
  const glow = up ? "18,212,107" : "239,51,64";
  const lean = up ? "HIGHER-CLOSE LEAN" : "LOWER-CLOSE LEAN";
  const arrowPath = up
    ? "M0 -118 L78 18 H42 V128 H-42 V18 H-78 Z"
    : "M0 118 L-78 -18 H-42 V-128 H42 V-18 H78 Z";

  const W = 1280;
  const H = 1920;
  const cx = W / 2;
  const starGap = 70;
  const stars = Array.from({ length: 5 }, (_, i) => {
    const color = i < c ? "#f0c24b" : "rgba(143,163,184,0.35)";
    const x = cx - starGap * 2 + i * starGap;
    return `<text x="${x}" y="1590" text-anchor="middle" font-family="${FONT}" font-size="64" font-weight="700" fill="${color}">★</text>`;
  }).join("");
  const leanW = Math.max(280, lean.length * 20 + 72);
  const stamp = asof ? `Updated ${asof}` : "arrowbeat.com";

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.15" y2="1">
      <stop offset="0%" stop-color="#050b12"/>
      <stop offset="45%" stop-color="#0b1520"/>
      <stop offset="100%" stop-color="#071018"/>
    </linearGradient>
    <linearGradient id="arrow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${up ? "#5dffa8" : "#ff8a7a"}"/>
      <stop offset="55%" stop-color="${signal}"/>
      <stop offset="100%" stop-color="${up ? "#0a8f48" : "#a51020"}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="40%" r="48%">
      <stop offset="0%" stop-color="rgba(${glow},0.32)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <text x="${cx}" y="150" text-anchor="middle" font-family="${FONT}" font-size="80" font-weight="800" fill="#e8eef5">Arrow<tspan fill="${signal}">Beat</tspan></text>
  <text x="${cx}" y="215" text-anchor="middle" font-family="${FONT}" font-size="30" font-weight="600" fill="#8fa3b8">Daily market probability</text>
  <text x="${cx}" y="420" text-anchor="middle" font-family="${FONT}" font-size="210" font-weight="800" fill="#e8eef5" font-variant-numeric="tabular-nums">${p.toFixed(1)}<tspan font-size="92" fill="${signal}">%</tspan></text>
  <text x="${cx}" y="520" text-anchor="middle" font-family="${FONT}" font-size="44" font-weight="800" fill="#e8eef5">ArrowBeat Score</text>
  <g transform="translate(${cx} 820) scale(1.75)">
    <path fill="url(#arrow)" d="${arrowPath}"/>
  </g>
  <rect x="${cx - leanW / 2}" y="1140" rx="34" ry="34" width="${leanW}" height="68" fill="rgba(${glow},0.14)" stroke="rgba(${glow},0.45)" stroke-width="2.5"/>
  <text x="${cx}" y="1185" text-anchor="middle" font-family="${FONT}" font-size="36" font-weight="700" fill="${signal}">${lean}</text>
  <text x="${cx}" y="1280" text-anchor="middle" font-family="${FONT}" font-size="42" font-weight="700" fill="#8fa3b8">${label}</text>
  <text x="${cx}" y="1360" text-anchor="middle" font-family="${FONT}" font-size="36" font-weight="500" fill="#8fa3b8">Probability of ${up ? "higher" : "lower"} close</text>
  <text x="${cx}" y="1490" text-anchor="middle" font-family="${FONT}" font-size="34" font-weight="600" fill="#8fa3b8">Confidence</text>
  ${stars}
  <text x="${cx}" y="${H - 100}" text-anchor="middle" font-family="${FONT}" font-size="30" font-weight="500" fill="rgba(143,163,184,0.9)">${stamp}</text>
  <text x="${cx}" y="${H - 56}" text-anchor="middle" font-family="${FONT}" font-size="30" font-weight="500" fill="rgba(143,163,184,0.9)">arrowbeat.com</text>
</svg>`;

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
    body: svg,
  };
}
