import { fetchLatestSportsBulletin } from "../../server/sports-bulletin";

type NetlifyResult = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

/**
 * Proxy sportsin60.com/bulletins/latest.json — that origin does not send CORS
 * headers, so the browser cannot fetch it directly from ArrowBeat.
 */
export async function handler(): Promise<NetlifyResult> {
  try {
    const payload = await fetchLatestSportsBulletin();
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
        error: error instanceof Error ? error.message : "Bulletin fetch failed",
      }),
    };
  }
}
