/** Client types for news + price co-movement (mirrors server/news-price). */

export type NewsImpactItem = {
  id: string;
  title: string;
  publisher: string;
  link: string;
  publishedAt: string;
  publishDate: string;
  eventDate: string | null;
  sameSessionPct: number | null;
  nextSessionPct: number | null;
  window3Pct: number | null;
};

export type NewsPricePayload = {
  symbol: string;
  fetchedAt: string;
  source: string;
  delayNote: string;
  items: NewsImpactItem[];
  disclaimer: string;
  error?: string;
};
