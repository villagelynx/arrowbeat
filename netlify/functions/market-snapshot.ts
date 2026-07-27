import { buildMarketSnapshot } from "../../server/market-snapshot";

type NetlifyEvent = {
  httpMethod?: string;
};

type NetlifyResult = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

/**
 * Production market API for Netlify.
 * Routed from /api/market/snapshot via netlify.toml.
 */
export async function handler(_event: NetlifyEvent): Promise<NetlifyResult> {
  try {
    const payload = await buildMarketSnapshot();
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
      statusCode: 502,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify({
        error: error instanceof Error ? error.message : "Market fetch failed",
      }),
    };
  }
}
