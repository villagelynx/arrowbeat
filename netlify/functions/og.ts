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
  const stars = Array.from({ length: 5 }, (_, i) => {
    const color = i < c ? "#f0c24b" : "rgba(143,163,184,0.35)";
    const x = 540 - 104 + i * 52;
    return `<text x="${x}" y="1140" text-anchor="middle" font-family="Manrope,Segoe UI,sans-serif" font-size="44" font-weight="700" fill="${color}">★</text>`;
  }).join("");
  const leanW = Math.max(220, lean.length * 14 + 56);
  const stamp = asof ? `Updated ${asof}` : "arrowbeat.com";

  const W = 1080;
  const H = 1350;

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
    <radialGradient id="glow" cx="50%" cy="28%" r="48%">
      <stop offset="0%" stop-color="rgba(${glow},0.32)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <text x="540" y="110" text-anchor="middle" font-family="Syne,Avenir Next,Segoe UI,sans-serif" font-size="72" font-weight="800" fill="#e8eef5">Arrow<tspan fill="${signal}">Beat</tspan></text>
  <text x="540" y="160" text-anchor="middle" font-family="Manrope,Avenir Next,Segoe UI,sans-serif" font-size="26" font-weight="600" fill="#8fa3b8">Daily market probability</text>
  <g transform="translate(540 430) scale(1.55)">
    <path fill="url(#arrow)" d="${arrowPath}"/>
  </g>
  <text x="540" y="640" text-anchor="middle" font-family="Syne,Avenir Next,Segoe UI,sans-serif" font-size="34" font-weight="700" fill="#e8eef5">ArrowBeat Score</text>
  <rect x="${540 - leanW / 2}" y="690" rx="26" ry="26" width="${leanW}" height="52" fill="rgba(${glow},0.14)" stroke="rgba(${glow},0.45)" stroke-width="2"/>
  <text x="540" y="724" text-anchor="middle" font-family="Manrope,Avenir Next,Segoe UI,sans-serif" font-size="26" font-weight="700" fill="${signal}">${lean}</text>
  <text x="540" y="800" text-anchor="middle" font-family="Syne,Avenir Next,Segoe UI,sans-serif" font-size="32" font-weight="700" fill="#8fa3b8">${label}</text>
  <text x="540" y="850" text-anchor="middle" font-family="Manrope,Avenir Next,Segoe UI,sans-serif" font-size="24" font-weight="500" fill="#8fa3b8">Probability of ${up ? "higher" : "lower"} close</text>
  <text x="540" y="1000" text-anchor="middle" font-family="Syne,Avenir Next,Segoe UI,sans-serif" font-size="148" font-weight="800" fill="#e8eef5">${p.toFixed(1)}<tspan font-size="64" fill="${signal}">%</tspan></text>
  <text x="540" y="1080" text-anchor="middle" font-family="Manrope,Avenir Next,Segoe UI,sans-serif" font-size="24" font-weight="600" fill="#8fa3b8">Confidence</text>
  ${stars}
  <text x="540" y="${H - 72}" text-anchor="middle" font-family="Manrope,Avenir Next,Segoe UI,sans-serif" font-size="22" font-weight="500" fill="rgba(143,163,184,0.9)">${stamp}</text>
  <text x="540" y="${H - 40}" text-anchor="middle" font-family="Manrope,Avenir Next,Segoe UI,sans-serif" font-size="22" font-weight="500" fill="rgba(143,163,184,0.9)">arrowbeat.com</text>
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
