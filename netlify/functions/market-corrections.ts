import { buildStockCorrectionsScan } from "../../server/stock-corrections";

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

/** Curated watchlist drawdowns — soft Yahoo 1y charts, free-tier safe. */
export async function handler(): Promise<NetlifyResult> {
  try {
    const payload = await withDeadline(buildStockCorrectionsScan(), 9000);
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=180",
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
        error: error instanceof Error ? error.message : "Corrections scan failed",
      }),
    };
  }
}
