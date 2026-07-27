import { buildStockQuote } from "../../server/market-snapshot";

type NetlifyEvent = {
  queryStringParameters?: Record<string, string | undefined> | null;
};

type NetlifyResult = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Function deadline ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Single-symbol delayed quote — short deadline for Netlify free tier. */
export async function handler(event: NetlifyEvent): Promise<NetlifyResult> {
  const symbol = event.queryStringParameters?.symbol ?? "";
  try {
    const payload = await withDeadline(buildStockQuote(symbol), 5000);
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=60",
      },
      body: JSON.stringify(payload),
    };
  } catch (error) {
    return {
      statusCode: 404,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify({
        error: error instanceof Error ? error.message : "Quote fetch failed",
        symbol,
      }),
    };
  }
}
