/**
 * Corporate / ticker icons via free public CDNs (no API key).
 * Primary: Parqet symbol logos. Fallback: Google favicon by company domain.
 */

const SYMBOL_DOMAIN: Record<string, string> = {
  AAPL: "apple.com",
  MSFT: "microsoft.com",
  NVDA: "nvidia.com",
  AMZN: "amazon.com",
  META: "meta.com",
  GOOGL: "abc.xyz",
  GOOG: "abc.xyz",
  TSLA: "tesla.com",
  SPY: "ssga.com",
  QQQ: "invesco.com",
  IWM: "ishares.com",
  DIA: "ssga.com",
  VTI: "vanguard.com",
  "BTC-USD": "bitcoin.org",
  BTC: "bitcoin.org",
  "ETH-USD": "ethereum.org",
  ETH: "ethereum.org",
  "CL=F": "cmegroup.com",
  "GC=F": "cmegroup.com",
  "SI=F": "cmegroup.com",
  OIL: "cmegroup.com",
  GOLD: "cmegroup.com",
  SILVER: "cmegroup.com",
};

/** Normalize desk / Yahoo symbols for logo lookup. */
export function logoSymbolKey(raw: string): string {
  const s = raw.trim().toUpperCase();
  if (s === "BTCUSD" || s === "XBT-USD") return "BTC-USD";
  if (s === "ETHUSD") return "ETH-USD";
  return s;
}

export function domainForSymbol(symbol: string): string | null {
  const key = logoSymbolKey(symbol);
  return SYMBOL_DOMAIN[key] ?? null;
}

/** Best free logo URL for a ticker (Parqet PNG). */
export function logoUrlForSymbol(symbol: string, size = 64): string {
  const key = logoSymbolKey(symbol);
  // Parqet serves equities / common ETFs by ticker.
  const ticker = key.includes("-") || key.includes("=") ? key.split(/[-/=]/)[0]! : key;
  const parqet = `https://assets.parqet.com/logos/symbol/${encodeURIComponent(ticker)}?format=png`;
  void size;
  return parqet;
}

/** Domain favicon fallback when Parqet 404s. */
export function faviconUrlForSymbol(symbol: string, size = 64): string | null {
  const domain = domainForSymbol(symbol);
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

export function lettermarkForSymbol(symbol: string): string {
  const key = logoSymbolKey(symbol);
  if (key === "BTC-USD" || key === "BTC") return "₿";
  if (key === "ETH-USD" || key === "ETH") return "Ξ";
  const clean = key.replace(/[^A-Z0-9]/g, "");
  return (clean.slice(0, 1) || "?").toUpperCase();
}
