import type { Bias } from "./signal";
import { SCORE_SHARE_ORIGIN } from "./scorecard";

/** Snapshot encoded in `?view=share&bias=&p=&c=&label=` links. */
export type SignalSharePayload = {
  bias: Bias;
  /** Lead probability for the lean direction (0–100). */
  probability: number;
  /** Confidence stars 1–5. */
  confidence: number;
  /** Short card label, e.g. Tomorrow / Today. */
  label: string;
  /** Optional “Updated …” stamp (already human-readable or ISO date). */
  updated?: string;
};

export type SignalShareOutcome = "shared" | "copied" | "preview" | "aborted" | "failed";

export const SIGNAL_SHARE_ORIGIN = SCORE_SHARE_ORIGIN;

/** Visible name for the hero / share-card arrow. */
export const ARROW_SCORE_LABEL = "ArrowBeat Score";

/** Portrait share card — close to phone / Stories aspect (not OG landscape). */
export const SHARE_CARD_W = 1080;
export const SHARE_CARD_H = 1350;

export function leanChipLabel(bias: Bias): string {
  return bias === "up" ? "Higher-close lean" : "Lower-close lean";
}

/** Alias kept for call sites that prefer the shorter name. */
export const leanLabel = leanChipLabel;

export function formatShareUpdated(asOfDate: string): string {
  const iso = asOfDate.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const pretty = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${iso}T12:00:00-04:00`));
    return pretty;
  }
  return iso || new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date());
}

export function buildSignalShareUrl(payload: SignalSharePayload): string {
  const url = new URL("/", SIGNAL_SHARE_ORIGIN);
  url.searchParams.set("view", "share");
  url.searchParams.set("bias", payload.bias);
  url.searchParams.set("p", roundProb(payload.probability).toFixed(1));
  url.searchParams.set("c", String(clampConfidence(payload.confidence)));
  if (payload.label.trim()) {
    url.searchParams.set("label", payload.label.trim().slice(0, 48));
  }
  if (payload.updated?.trim()) {
    url.searchParams.set("asof", payload.updated.trim().slice(0, 64));
  }
  return url.toString();
}

/** Dynamic OG image URL for crawlers / link previews. */
export function buildOgImageUrl(payload: SignalSharePayload): string {
  const url = new URL("/api/og", SIGNAL_SHARE_ORIGIN);
  url.searchParams.set("bias", payload.bias);
  url.searchParams.set("p", roundProb(payload.probability).toFixed(1));
  url.searchParams.set("c", String(clampConfidence(payload.confidence)));
  if (payload.label.trim()) {
    url.searchParams.set("label", payload.label.trim().slice(0, 48));
  }
  if (payload.updated?.trim()) {
    url.searchParams.set("asof", payload.updated.trim().slice(0, 64));
  }
  return url.toString();
}

export function parseSignalShareParams(
  params: URLSearchParams,
): SignalSharePayload | null {
  if (params.get("view") !== "share") return null;
  const biasRaw = params.get("bias");
  const bias: Bias | null =
    biasRaw === "up" || biasRaw === "down" ? biasRaw : null;
  if (!bias) return null;

  const p = Number(params.get("p"));
  if (!Number.isFinite(p) || p < 0 || p > 100) return null;

  const cRaw = Number(params.get("c"));
  const confidence = Number.isFinite(cRaw) ? clampConfidence(cRaw) : 3;
  const label =
    (params.get("label") ?? "").trim().slice(0, 48) ||
    (bias === "up" ? "Higher close" : "Lower close");
  const asof = (params.get("asof") ?? "").trim().slice(0, 64);
  return {
    bias,
    probability: roundProb(p),
    confidence,
    label,
    updated: asof || undefined,
  };
}

export function readSignalShareFromLocation(): SignalSharePayload | null {
  if (typeof window === "undefined") return null;
  return parseSignalShareParams(new URLSearchParams(window.location.search));
}

function roundProb(n: number): number {
  return Math.round(n * 10) / 10;
}

function clampConfidence(n: number): number {
  return Math.min(5, Math.max(1, Math.round(n)));
}

/** Short line for rare fallbacks — prefer omitting from Web Share. */
export function shareText(payload: SignalSharePayload): string {
  return `ArrowBeat Score · ${payload.probability.toFixed(1)}%`;
}

/**
 * Portrait PNG matching the website hero stack:
 * brand → arrow + score label → lean / label / probability / confidence.
 */
export async function renderSignalSharePng(
  payload: SignalSharePayload,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = SHARE_CARD_W;
  canvas.height = SHARE_CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  const W = SHARE_CARD_W;
  const H = SHARE_CARD_H;
  const cx = W / 2;
  const up = payload.bias === "up";
  const glow = up ? "18, 212, 107" : "239, 51, 64";
  const signal = up ? "#12d46b" : "#ef3340";
  const signalHi = up ? "#5dffa8" : "#ff8a7a";
  const signalLo = up ? "#0a8f48" : "#a51020";

  const bg = ctx.createLinearGradient(0, 0, W * 0.15, H);
  bg.addColorStop(0, "#050b12");
  bg.addColorStop(0.45, "#0b1520");
  bg.addColorStop(1, "#071018");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const rad = ctx.createRadialGradient(cx, H * 0.28, 40, cx, H * 0.28, 520);
  rad.addColorStop(0, `rgba(${glow}, 0.32)`);
  rad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = rad;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.strokeStyle = "rgba(232, 238, 245, 0.045)";
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.restore();

  // Brand — top center
  ctx.textAlign = "center";
  ctx.font = '800 64px Syne, "Avenir Next", "Segoe UI", sans-serif';
  const brandY = 110;
  const arrowWord = "Arrow";
  const beatWord = "Beat";
  const arrowW = ctx.measureText(arrowWord).width;
  const beatW = ctx.measureText(beatWord).width;
  const brandLeft = cx - (arrowW + beatW) / 2;
  ctx.textAlign = "left";
  ctx.fillStyle = "#e8eef5";
  ctx.fillText(arrowWord, brandLeft, brandY);
  ctx.fillStyle = signal;
  ctx.fillText(beatWord, brandLeft + arrowW, brandY);

  ctx.textAlign = "center";
  ctx.font = '600 22px Manrope, "Avenir Next", "Segoe UI", sans-serif';
  ctx.fillStyle = "#8fa3b8";
  ctx.fillText("Daily market probability", cx, 158);

  // Arrow + score label (hero center)
  drawShareArrow(ctx, up, signalHi, signal, signalLo, cx, 430, 1.45);

  ctx.font = '800 34px Syne, "Avenir Next", "Segoe UI", sans-serif';
  ctx.fillStyle = "#e8eef5";
  ctx.fillText(ARROW_SCORE_LABEL, cx, 640);

  // Lean pill
  const lean = leanChipLabel(payload.bias).toUpperCase();
  ctx.font = '700 24px Manrope, "Avenir Next", "Segoe UI", sans-serif';
  const leanMetrics = ctx.measureText(lean);
  const pillPadX = 28;
  const pillW = leanMetrics.width + pillPadX * 2;
  const pillH = 48;
  const pillX = cx - pillW / 2;
  const pillY = 690;
  roundRect(ctx, pillX, pillY, pillW, pillH, 24);
  ctx.fillStyle = `rgba(${glow}, 0.14)`;
  ctx.fill();
  ctx.strokeStyle = `rgba(${glow}, 0.45)`;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = signal;
  ctx.fillText(lean, cx, pillY + 32);

  // Session label
  ctx.font = '700 28px Syne, "Avenir Next", "Segoe UI", sans-serif';
  ctx.fillStyle = "#8fa3b8";
  ctx.fillText(payload.label, cx, 790);

  ctx.font = '500 24px Manrope, "Avenir Next", "Segoe UI", sans-serif';
  ctx.fillStyle = "#8fa3b8";
  ctx.fillText(
    `Probability of ${up ? "higher" : "lower"} close`,
    cx,
    840,
  );

  // Big probability
  ctx.font = '800 168px Syne, "Avenir Next", "Segoe UI", sans-serif';
  ctx.fillStyle = "#e8eef5";
  const pct = payload.probability.toFixed(1);
  const pctW = ctx.measureText(pct).width;
  ctx.font = '700 72px Syne, "Avenir Next", "Segoe UI", sans-serif';
  const pctMarkW = ctx.measureText("%").width;
  const blockW = pctW + 12 + pctMarkW;
  const pctLeft = cx - blockW / 2;
  ctx.textAlign = "left";
  ctx.font = '800 168px Syne, "Avenir Next", "Segoe UI", sans-serif';
  ctx.fillStyle = "#e8eef5";
  ctx.fillText(pct, pctLeft, 1000);
  ctx.font = '700 72px Syne, "Avenir Next", "Segoe UI", sans-serif';
  ctx.fillStyle = signal;
  ctx.fillText("%", pctLeft + pctW + 12, 975);

  // Confidence
  ctx.textAlign = "center";
  ctx.font = '600 22px Manrope, "Avenir Next", "Segoe UI", sans-serif';
  ctx.fillStyle = "#8fa3b8";
  ctx.fillText("Confidence", cx, 1085);

  const starGap = 52;
  const starsW = starGap * 4;
  const starLeft = cx - starsW / 2;
  ctx.font = '700 44px Manrope, "Avenir Next", "Segoe UI", sans-serif';
  ctx.textAlign = "left";
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < payload.confidence ? "#f0c24b" : "rgba(143, 163, 184, 0.35)";
    ctx.fillText("★", starLeft + i * starGap, 1145);
  }

  // Footer
  ctx.textAlign = "center";
  const stamp = payload.updated?.trim()
    ? `Updated ${payload.updated.trim()}`
    : `Updated ${formatShareUpdated("")}`;
  ctx.font = '500 22px Manrope, "Avenir Next", "Segoe UI", sans-serif';
  ctx.fillStyle = "rgba(143, 163, 184, 0.9)";
  ctx.fillText(`${stamp}  ·  arrowbeat.com`, cx, H - 56);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("PNG encode failed"))),
      "image/png",
    );
  });
}

function drawShareArrow(
  ctx: CanvasRenderingContext2D,
  up: boolean,
  hi: string,
  mid: string,
  lo: string,
  cx: number,
  cy: number,
  scale = 1,
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.shadowColor = mid;
  ctx.shadowBlur = 42;
  const grad = ctx.createLinearGradient(0, up ? -140 : 140, 0, up ? 140 : -140);
  grad.addColorStop(0, hi);
  grad.addColorStop(0.55, mid);
  grad.addColorStop(1, lo);
  ctx.fillStyle = grad;
  ctx.beginPath();
  if (up) {
    ctx.moveTo(0, -118);
    ctx.lineTo(78, 18);
    ctx.lineTo(42, 18);
    ctx.lineTo(42, 128);
    ctx.lineTo(-42, 128);
    ctx.lineTo(-42, 18);
    ctx.lineTo(-78, 18);
  } else {
    ctx.moveTo(0, 118);
    ctx.lineTo(-78, -18);
    ctx.lineTo(-42, -18);
    ctx.lineTo(-42, -128);
    ctx.lineTo(42, -128);
    ctx.lineTo(42, -18);
    ctx.lineTo(78, -18);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/**
 * Prefer Web Share with PNG first + URL (no verbose text);
 * fall back to URL-only (best for tappable OG preview) / clipboard + preview.
 */
export async function shareSignalCard(
  payload: SignalSharePayload,
  opts: { forcePreview?: boolean } = {},
): Promise<{ result: SignalShareOutcome; url: string; blob: Blob | null }> {
  const url = buildSignalShareUrl(payload);
  const title = "ArrowBeat Score";

  let blob: Blob;
  try {
    blob = await renderSignalSharePng(payload);
  } catch {
    return { result: "failed", url, blob: null };
  }

  if (opts.forcePreview) {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // still return preview
    }
    return { result: "preview", url, blob };
  }

  const file = new File([blob], "arrowbeat-score.png", { type: "image/png" });
  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
  };

  // Image first in the payload; omit long summary so the card / link lead.
  if (typeof nav.share === "function" && typeof nav.canShare === "function") {
    try {
      const withFile: ShareData = { files: [file], url, title };
      if (nav.canShare(withFile)) {
        await nav.share(withFile);
        return { result: "shared", url, blob };
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        return { result: "aborted", url, blob };
      }
    }
  }

  // URL-only — iMessage/Slack can show a tappable OG preview of the share page.
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title, url });
      return { result: "shared", url, blob };
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        return { result: "aborted", url, blob };
      }
    }
  }

  try {
    await navigator.clipboard.writeText(url);
  } catch {
    // Preview still useful without clipboard.
  }
  return { result: "preview", url, blob };
}

export function downloadSignalSharePng(blob: Blob, filename = "arrowbeat-score.png") {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 2_000);
}
