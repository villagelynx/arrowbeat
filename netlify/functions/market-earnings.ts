import { buildEarningsPreview } from "../../server/earnings-preview";

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

/** Upcoming Mag7 + large-cap earnings desk (Nasdaq calendar). */
export async function handler(): Promise<NetlifyResult> {
  try {
    const payload = await withDeadline(buildEarningsPreview(14), 9000);
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=300",
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
        error: error instanceof Error ? error.message : "Earnings preview fetch failed",
      }),
    };
  }
}
