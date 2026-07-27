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

export function shareText(payload: SignalSharePayload): string {
  const lean = payload.bias === "up" ? "Higher-close" : "Lower-close";
  return `ArrowBeat Score · ${payload.label}: ${lean} lean · ${payload.probability.toFixed(1)}% · ${payload.confidence}/5 confidence`;
}

const CARD_W = 1200;
const CARD_H = 630;

/** Render an OG-friendly PNG of the current signal card. */
export async function renderSignalSharePng(
  payload: SignalSharePayload,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  const up = payload.bias === "up";
  const glow = up ? "18, 212, 107" : "239, 51, 64";
  const signal = up ? "#12d46b" : "#ef3340";
  const signalHi = up ? "#5dffa8" : "#ff8a7a";
  const signalLo = up ? "#0a8f48" : "#a51020";

  const bg = ctx.createLinearGradient(0, 0, CARD_W * 0.2, CARD_H);
  bg.addColorStop(0, "#050b12");
  bg.addColorStop(0.45, "#0b1520");
  bg.addColorStop(1, "#071018");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const rad = ctx.createRadialGradient(
    CARD_W * 0.28,
    CARD_H * 0.35,
    20,
    CARD_W * 0.28,
    CARD_H * 0.35,
    420,
  );
  rad.addColorStop(0, `rgba(${glow}, 0.28)`);
  rad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = rad;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  ctx.save();
  ctx.strokeStyle = "rgba(232, 238, 245, 0.045)";
  ctx.lineWidth = 1;
  for (let x = 0; x < CARD_W; x += 28) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, CARD_H);
    ctx.stroke();
  }
  for (let y = 0; y < CARD_H; y += 28) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CARD_W, y);
    ctx.stroke();
  }
  ctx.restore();

  // Brand
  ctx.font = '800 52px Syne, "Avenir Next", "Segoe UI", sans-serif';
  ctx.fillStyle = "#e8eef5";
  ctx.fillText("Arrow", 64, 88);
  const arrowW = ctx.measureText("Arrow").width;
  ctx.fillStyle = signal;
  ctx.fillText("Beat", 64 + arrowW, 88);

  ctx.font = '600 22px Manrope, "Avenir Next", "Segoe UI", sans-serif';
  ctx.fillStyle = "#8fa3b8";
  ctx.fillText("Daily market probability", 64, 128);

  // Arrow + score label
  const arrowCx = 210;
  const arrowCy = 330;
  drawShareArrow(ctx, up, signalHi, signal, signalLo, arrowCx, arrowCy);

  ctx.font = '700 22px Syne, "Avenir Next", "Segoe UI", sans-serif';
  ctx.fillStyle = "#e8eef5";
  const scoreLabel = ARROW_SCORE_LABEL;
  const scoreW = ctx.measureText(scoreLabel).width;
  ctx.fillText(scoreLabel, arrowCx - scoreW / 2, 520);

  // Lean pill
  const lean = leanChipLabel(payload.bias).toUpperCase();
  ctx.font = '700 22px Manrope, "Avenir Next", "Segoe UI", sans-serif';
  const leanMetrics = ctx.measureText(lean);
  const pillPadX = 22;
  const pillW = leanMetrics.width + pillPadX * 2;
  const pillH = 44;
  const pillX = 520;
  const pillY = 190;
  roundRect(ctx, pillX, pillY, pillW, pillH, 22);
  ctx.fillStyle = `rgba(${glow}, 0.14)`;
  ctx.fill();
  ctx.strokeStyle = `rgba(${glow}, 0.4)`;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = signal;
  ctx.fillText(lean, pillX + pillPadX, pillY + 29);

  ctx.font = '700 28px Syne, "Avenir Next", "Segoe UI", sans-serif';
  ctx.fillStyle = "#8fa3b8";
  ctx.fillText(payload.label, 520, 280);

  ctx.font = '500 22px Manrope, "Avenir Next", "Segoe UI", sans-serif';
  ctx.fillStyle = "#8fa3b8";
  ctx.fillText(
    `Probability of ${up ? "higher" : "lower"} close`,
    520,
    330,
  );

  ctx.font = '800 120px Syne, "Avenir Next", "Segoe UI", sans-serif';
  ctx.fillStyle = "#e8eef5";
  const pct = payload.probability.toFixed(1);
  ctx.fillText(pct, 520, 450);
  const pctW = ctx.measureText(pct).width;
  ctx.font = '700 48px Syne, "Avenir Next", "Segoe UI", sans-serif';
  ctx.fillStyle = signal;
  ctx.fillText("%", 520 + pctW + 8, 430);

  ctx.font = '600 20px Manrope, "Avenir Next", "Segoe UI", sans-serif';
  ctx.fillStyle = "#8fa3b8";
  ctx.fillText("Confidence", 520, 510);
  ctx.font = '700 36px Manrope, "Avenir Next", "Segoe UI", sans-serif';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < payload.confidence ? "#f0c24b" : "rgba(143, 163, 184, 0.35)";
    ctx.fillText("★", 520 + i * 42, 558);
  }

  const stamp = payload.updated?.trim()
    ? `Updated ${payload.updated.trim()}`
    : `Updated ${formatShareUpdated("")}`;
  ctx.font = '500 18px Manrope, "Avenir Next", "Segoe UI", sans-serif';
  ctx.fillStyle = "rgba(143, 163, 184, 0.85)";
  ctx.fillText(stamp, 64, CARD_H - 40);
  const host = "arrowbeat.com";
  ctx.fillText(host, CARD_W - 64 - ctx.measureText(host).width, CARD_H - 40);

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
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1.05, 1.05);
  ctx.shadowColor = mid;
  ctx.shadowBlur = 36;
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
 * Prefer Web Share with PNG file + link; fall back to URL share / clipboard + preview.
 */
export async function shareSignalCard(
  payload: SignalSharePayload,
  opts: { forcePreview?: boolean } = {},
): Promise<{ result: SignalShareOutcome; url: string; blob: Blob | null }> {
  const url = buildSignalShareUrl(payload);
  const title = "ArrowBeat Score";
  const text = shareText(payload);

  let blob: Blob;
  try {
    blob = await renderSignalSharePng(payload);
  } catch {
    return { result: "failed", url, blob: null };
  }

  if (opts.forcePreview) {
    let copied = false;
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
    } catch {
      // still return preview
    }
    return { result: copied ? "preview" : "preview", url, blob };
  }

  const file = new File([blob], "arrowbeat-score.png", { type: "image/png" });
  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
  };

  if (typeof nav.share === "function" && typeof nav.canShare === "function") {
    try {
      if (nav.canShare({ files: [file] })) {
        await nav.share({ title, text, url, files: [file] });
        return { result: "shared", url, blob };
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        return { result: "aborted", url, blob };
      }
    }
  }

  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text, url });
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
