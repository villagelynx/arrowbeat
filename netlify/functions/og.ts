/**
 * Dynamic OG image (SVG) for signal share links.
 *
 * Usage: `/api/og?bias=up&p=58.2&c=4&label=Tomorrow`
 *
 * Rich-link previews (Slack/iMessage/Twitter) need a crawler-visible `og:image`.
 * This SPA cannot inject per-URL meta at request time without an HTML edge
 * rewrite — so default meta in `index.html` points at `/og-default.svg`.
 * Wire this function into crawler HTML (or a prerender) when you want
 * param-specific previews; clients already share a PNG via Web Share / download.
 */

type NetlifyEvent = {
  queryStringParameters?: Record<string, string | undefined> | null;
};

type NetlifyResult = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

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
  const signal = up ? "#12d46b" : "#ef3340";
  const glow = up ? "18,212,107" : "239,51,64";
  const lean = up ? "HIGHER-CLOSE LEAN" : "LOWER-CLOSE LEAN";
  const arrowPath = up
    ? "M120 28 L210 150 H168 V292 H72 V150 H30 Z"
    : "M120 292 L30 170 H72 V28 H168 V170 H210 Z";
  const stars = Array.from({ length: 5 }, (_, i) => {
    const color = i < c ? "#f0c24b" : "rgba(143,163,184,0.35)";
    return `<text x="${520 + i * 40}" y="500" font-family="Manrope,Segoe UI,sans-serif" font-size="36" font-weight="700" fill="${color}">★</text>`;
  }).join("");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#050b12"/>
      <stop offset="45%" stop-color="#0b1520"/>
      <stop offset="100%" stop-color="#071018"/>
    </linearGradient>
    <linearGradient id="arrow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${up ? "#5dffa8" : "#ff8a7a"}"/>
      <stop offset="55%" stop-color="${signal}"/>
      <stop offset="100%" stop-color="${up ? "#0a8f48" : "#a51020"}"/>
    </linearGradient>
    <radialGradient id="glow" cx="28%" cy="20%" r="55%">
      <stop offset="0%" stop-color="rgba(${glow},0.28)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <text x="64" y="86" font-family="Syne,Avenir Next,Segoe UI,sans-serif" font-size="54" font-weight="800" fill="#e8eef5">Arrow<tspan fill="${signal}">Beat</tspan></text>
  <text x="64" y="122" font-family="Manrope,Avenir Next,Segoe UI,sans-serif" font-size="18" font-weight="600" fill="#8fa3b8">Daily market probability</text>
  <g transform="translate(160 200)">
    <path fill="url(#arrow)" d="${arrowPath}"/>
  </g>
  <rect x="520" y="200" rx="21" ry="21" width="${lean.length * 11.2 + 44}" height="42" fill="rgba(${glow},0.14)" stroke="rgba(${glow},0.4)" stroke-width="2"/>
  <text x="542" y="227" font-family="Manrope,Avenir Next,Segoe UI,sans-serif" font-size="18" font-weight="700" fill="${signal}">${lean}</text>
  <text x="520" y="280" font-family="Manrope,Avenir Next,Segoe UI,sans-serif" font-size="22" font-weight="700" fill="#8fa3b8">${label}</text>
  <text x="520" y="400" font-family="Syne,Avenir Next,Segoe UI,sans-serif" font-size="120" font-weight="800" fill="#e8eef5">${p.toFixed(1)}<tspan font-size="48" fill="${signal}">%</tspan></text>
  <text x="520" y="440" font-family="Manrope,Avenir Next,Segoe UI,sans-serif" font-size="20" font-weight="600" fill="#8fa3b8">Probability of ${up ? "higher" : "lower"} close</text>
  ${stars}
  <text x="740" y="496" font-family="Manrope,Avenir Next,Segoe UI,sans-serif" font-size="18" font-weight="600" fill="#8fa3b8">Confidence</text>
  <text x="64" y="590" font-family="Manrope,Avenir Next,Segoe UI,sans-serif" font-size="16" font-weight="600" fill="rgba(143,163,184,0.85)">arrowbeat.com</text>
  <text x="960" y="590" font-family="Manrope,Avenir Next,Segoe UI,sans-serif" font-size="16" font-weight="600" fill="rgba(143,163,184,0.85)">Not financial advice</text>
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
