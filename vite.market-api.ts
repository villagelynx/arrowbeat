import type { Plugin } from "vite";
import { buildMarketSnapshot, buildStockQuote } from "./server/market-snapshot.ts";

function json(res: import("http").ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=120");
  res.end(JSON.stringify(body));
}

function pathOnly(url: string): string {
  return url.split("?")[0] ?? url;
}

function queryParam(url: string, key: string): string {
  try {
    return new URL(url, "http://localhost").searchParams.get(key) ?? "";
  } catch {
    return "";
  }
}

/** Dev/preview API — same payload as the Netlify functions. */
export function marketApiPlugin(): Plugin {
  return {
    name: "arrowbeat-market-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/market")) return next();
        try {
          const path = pathOnly(req.url);
          if (path === "/api/market/snapshot") {
            json(res, 200, await buildMarketSnapshot());
            return;
          }
          if (path === "/api/market/quote") {
            json(res, 200, await buildStockQuote(queryParam(req.url, "symbol")));
            return;
          }
          json(res, 404, { error: "Not found" });
        } catch (error) {
          json(res, 502, {
            error: error instanceof Error ? error.message : "Market fetch failed",
          });
        }
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/market")) return next();
        try {
          const path = pathOnly(req.url);
          if (path === "/api/market/snapshot") {
            json(res, 200, await buildMarketSnapshot());
            return;
          }
          if (path === "/api/market/quote") {
            json(res, 200, await buildStockQuote(queryParam(req.url, "symbol")));
            return;
          }
          json(res, 404, { error: "Not found" });
        } catch (error) {
          json(res, 502, {
            error: error instanceof Error ? error.message : "Market fetch failed",
          });
        }
      });
    },
  };
}
