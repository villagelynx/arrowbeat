import type { Bias } from "./signal";
import { SCORE_SHARE_ORIGIN } from "./scorecard";

/** Snapshot encoded in `?view=share&bias=&p=&c=&label=` links. */
export type SignalSharePayload = {
  bias: Bias;
  /** Lead probability for the lean direction (0–100). */
  probability: number;
  /** Confidence stars 1–5. */
  confidence: number;
  /** Short card label, e.g. Tomorrow / Today / Mon Jul 28. */
  label: string;
  /** Optional “Updated …” stamp. */
  updated?: string;
};

export const SIGNAL_SHARE_ORIGIN = SCORE_SHARE_ORIGIN;

export function leanLabel(bias: Bias): string {
  return bias === "up" ? "Higher-close lean" : "Lower-close lean";
}

export function buildSignalShareUrl(payload: SignalSharePayload): string {
  const url = new URL("/", SIGNAL_SHARE_ORIGIN);
  url.searchParams.set("view", "share");
  url.searchParams.set("bias", payload.bias);
  url.searchParams.set("p", roundProb(payload.probability).toFixed(1));
  url.searchParams.set(
    "c",
    String(clampConfidence(payload.confidence)),
  );
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

/** Short label for the share card / URL `label` param. */
export function shortShareLabel(opts: {
  tomorrowAsPrimary: boolean;
  skippedWeekend?: boolean;
  sessionLabel: string;
}): string {
  if (opts.tomorrowAsPrimary) {
    return opts.skippedWeekend ? "Next session" : "Tomorrow";
  }
  // "Wednesday, July 29, 2026" → "Wed Jul 29"
  const parts = opts.sessionLabel.split(",").map((s) => s.trim());
  if (parts.length >= 2) {
    const weekday = parts[0]!.slice(0, 3);
    const md = parts[1]!.replace(/\s+/g, " ");
    const mdShort = md.replace(
      /^(January|February|March|April|May|June|July|August|September|October|November|December)/,
      (m) => m.slice(0, 3),
    );
    return `${weekday} ${mdShort}`.slice(0, 48);
  }
  return "Today";
}

export function shareText(payload: SignalSharePayload): string {
  const lean = payload.bias === "up" ? "Higher-close" : "Lower-close";
  return `ArrowBeat ${payload.label}: ${lean} lean · ${payload.probability.toFixed(1)}% · ${payload.confidence}/5 confidence`;
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

  // Background
  const bg = ctx.createLinearGradient(0, 0, CARD_W * 0.2, CARD_H);
  bg.addColorStop(0, "#050b12");
  bg.addColorStop(0.45, "#0b1520");
  bg.addColorStop(1, "#071018");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Soft glow
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

  // Grid
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

  // Arrow
  drawShareArrow(ctx, up, signalHi, signal, signalLo, 210, 340);

  // Lean pill
  const lean = leanLabel(payload.bias).toUpperCase();
  ctx.font = '700 22px Manrope, "Avenir Next", "Segoe UI", sans-serif';
  const leanMetrics = ctx.measureText(lean);
  const pillPadX = 22;
  const pillW = leanMetrics.width + pillPadX * 2;
  const pillH = 44;
  const pillX = 520;
  const pillY = 200;
  roundRect(ctx, pillX, pillY, pillW, pillH, 22);
  ctx.fillStyle = `rgba(${glow}, 0.14)`;
  ctx.fill();
  ctx.strokeStyle = `rgba(${glow}, 0.4)`;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = signal;
  ctx.fillText(lean, pillX + pillPadX, pillY + 29);

  // Label + probability
  ctx.font = '700 28px Syne, "Avenir Next", "Segoe UI", sans-serif';
  ctx.fillStyle = "#8fa3b8";
  ctx.fillText(payload.label, 520, 290);

  ctx.font = '500 22px Manrope, "Avenir Next", "Segoe UI", sans-serif';
  ctx.fillStyle = "#8fa3b8";
  ctx.fillText(
    `Probability of ${up ? "higher" : "lower"} close`,
    520,
    340,
  );

  ctx.font = '800 120px Syne, "Avenir Next", "Segoe UI", sans-serif';
  ctx.fillStyle = "#e8eef5";
  const pct = payload.probability.toFixed(1);
  ctx.fillText(pct, 520, 460);
  const pctW = ctx.measureText(pct).width;
  ctx.font = '700 48px Syne, "Avenir Next", "Segoe UI", sans-serif';
  ctx.fillStyle = signal;
  ctx.fillText("%", 520 + pctW + 8, 440);

  // Confidence stars
  ctx.font = '600 20px Manrope, "Avenir Next", "Segoe UI", sans-serif';
  ctx.fillStyle = "#8fa3b8";
  ctx.fillText("Confidence", 520, 520);
  ctx.font = '700 36px Manrope, "Avenir Next", "Segoe UI", sans-serif';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < payload.confidence ? "#f0c24b" : "rgba(143, 163, 184, 0.35)";
    ctx.fillText("★", 520 + i * 42, 568);
  }

  // Footer stamp
  const stamp =
    payload.updated?.trim() ||
    `Updated ${new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date())}`;
  ctx.font = '500 18px Manrope, "Avenir Next", "Segoe UI", sans-serif';
  ctx.fillStyle = "rgba(143, 163, 184, 0.85)";
  ctx.fillText(stamp, 64, CARD_H - 40);
  ctx.fillText("arrowbeat.com", CARD_W - 64 - ctx.measureText("arrowbeat.com").width, CARD_H - 40);

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
  ctx.scale(1.15, 1.15);
  // Soft glow
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

export type SignalShareResult =
  | { ok: true; mode: "files" | "url" | "copied" }
  | { ok: false; mode: "aborted" | "preview"; blob?: Blob; url: string }
  | { ok: false; mode: "failed"; error: string; url: string };

/**
 * Prefer Web Share with PNG file + link; fall back to URL share / clipboard.
 * Returns `preview` when the caller should show a modal with the image.
 */
export async function shareSignalPayload(
  payload: SignalSharePayload,
): Promise<SignalShareResult> {
  const url = buildSignalShareUrl(payload);
  const title = "ArrowBeat";
  const text = shareText(payload);

  let blob: Blob;
  try {
    blob = await renderSignalSharePng(payload);
  } catch (e) {
    return {
      ok: false,
      mode: "failed",
      error: e instanceof Error ? e.message : "Could not render share image",
      url,
    };
  }

  const file = new File([blob], "arrowbeat-signal.png", { type: "image/png" });
  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
  };

  if (typeof nav.share === "function" && typeof nav.canShare === "function") {
    try {
      if (nav.canShare({ files: [file] })) {
        await nav.share({ title, text, url, files: [file] });
        return { ok: true, mode: "files" };
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        return { ok: false, mode: "aborted", url };
      }
    }
  }

  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text, url });
      return { ok: true, mode: "url" };
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        return { ok: false, mode: "aborted", url };
      }
    }
  }

  let copied = false;
  try {
    await navigator.clipboard.writeText(url);
    copied = true;
  } catch {
    // Preview modal still lets the user copy / download.
  }

  return {
    ok: false,
    mode: copied ? "preview" : "preview",
    blob,
    url,
  };
}

export function downloadBlob(blob: Blob, filename: string) {
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

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
