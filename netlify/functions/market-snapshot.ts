import { buildMarketSnapshot } from "../../server/market-snapshot";

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

/**
 * Live market API. Yahoo often stalls from Netlify function IPs — hard deadline
 * so the client can fall back to /market-snapshot.json from the last build.
 */
export async function handler(): Promise<NetlifyResult> {
  try {
    const payload = await withDeadline(buildMarketSnapshot(), 8000);
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
      statusCode: 502,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify({
        error: error instanceof Error ? error.message : "Market fetch failed",
        hint: "Client should use /market-snapshot.json build fallback",
      }),
    };
  }
}
