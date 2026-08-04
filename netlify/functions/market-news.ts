import { buildNewsPriceImpact } from "../../server/news-price";

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

/** Yahoo headlines + session co-movement for a ticker. */
export async function handler(event: NetlifyEvent): Promise<NetlifyResult> {
  const symbol = event.queryStringParameters?.symbol ?? "";
  try {
    const payload = await withDeadline(buildNewsPriceImpact(symbol), 9000);
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=120",
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
        error: error instanceof Error ? error.message : "News fetch failed",
        symbol,
        items: [],
      }),
    };
  }
}
