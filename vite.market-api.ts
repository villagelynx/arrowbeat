import type { Plugin } from "vite";
import { buildMarketSnapshot, buildStockQuote } from "./server/market-snapshot.ts";
import { buildStockCorrectionsScan } from "./server/stock-corrections.ts";
import { fetchLatestSportsBulletin } from "./server/sports-bulletin.ts";

function json(res: import("http").ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=120");
  res.end(JSON.stringify(body));
}

async function handleApi(
  req: import("http").IncomingMessage,
  res: import("http").ServerResponse,
  next: () => void,
) {
  const path = req.url?.split("?")[0];
  if (!path?.startsWith("/api/")) return next();

  try {
    if (path === "/api/market/snapshot") {
      json(res, 200, await buildMarketSnapshot());
      return;
    }
    if (path === "/api/market/quote") {
      const symbol = new URL(req.url!, "http://localhost").searchParams.get("symbol") ?? "";
      try {
        json(res, 200, await buildStockQuote(symbol));
      } catch (error) {
        json(res, 404, {
          error: error instanceof Error ? error.message : "Quote fetch failed",
          symbol,
        });
      }
      return;
    }
    if (path === "/api/market/corrections") {
      json(res, 200, await buildStockCorrectionsScan());
      return;
    }
    if (path === "/api/sports/bulletin") {
      try {
        json(res, 200, await fetchLatestSportsBulletin());
      } catch (error) {
        json(res, 502, {
          error: error instanceof Error ? error.message : "Bulletin fetch failed",
        });
      }
      return;
    }
    if (path.startsWith("/api/market") || path.startsWith("/api/sports")) {
      json(res, 404, { error: "Not found" });
      return;
    }
    return next();
  } catch (error) {
    json(res, 502, {
      error: error instanceof Error ? error.message : "API fetch failed",
    });
  }
}

/** Dev/preview API — same payload as the Netlify functions. */
export function marketApiPlugin(): Plugin {
  return {
    name: "arrowbeat-market-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleApi(req, res, next);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleApi(req, res, next);
      });
    },
  };
}
