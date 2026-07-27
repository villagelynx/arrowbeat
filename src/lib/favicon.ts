import type { Bias } from "./signal";

const UP = "#12d46b";
const DOWN = "#ef3340";
const NEUTRAL = "#8fa3b5";
const BG = "#071018";
const STORAGE_KEY = "arrowbeat-favicon-bias";

type FaviconTone = Bias | "neutral";

function arrowPath(tone: FaviconTone): string {
  if (tone === "down") {
    return "M64 110 L26 56 H44 V18 H84 V56 H102 Z";
  }
  return "M64 18 L102 72 H84 V110 H44 V72 H26 Z";
}

function fillFor(tone: FaviconTone): string {
  if (tone === "up") return UP;
  if (tone === "down") return DOWN;
  return NEUTRAL;
}

/** Brand arrow mark as an SVG data URL — green up, red down, or neutral slate. */
export function faviconDataUrl(tone: FaviconTone): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none"><rect width="128" height="128" rx="28" fill="${BG}"/><path d="${arrowPath(tone)}" fill="${fillFor(tone)}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function setDocumentFavicon(tone: FaviconTone): void {
  const href = faviconDataUrl(tone);
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.type = "image/svg+xml";
  // Browsers often ignore same-href updates; swap to force a refresh when bias flips.
  if (link.href === href) return;
  link.href = href;
}

export function readStoredFaviconBias(): Bias | null {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    if (v === "up" || v === "down") return v;
  } catch {
    /* private mode / blocked storage */
  }
  return null;
}

export function storeFaviconBias(bias: Bias): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, bias);
  } catch {
    /* private mode / blocked storage */
  }
}

/** Apply live prediction color and remember it for this session. */
export function applySignalFavicon(bias: Bias): void {
  storeFaviconBias(bias);
  setDocumentFavicon(bias);
}

/**
 * Before the live signal arrives: restore last-known bias if we have one,
 * otherwise leave the static neutral favicon from index.html.
 */
export function applyInitialFavicon(): void {
  const last = readStoredFaviconBias();
  if (last) setDocumentFavicon(last);
}
