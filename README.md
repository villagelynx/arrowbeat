# ArrowBeat

Daily market probability report — a big green or red arrow before the opening bell.

**Positioning:** probability signal, not a crystal ball.

## Run locally

```bash
cd ~/Documents/Arrowbeat
npm install
npm run dev
```

Open the printed local URL. The Vite server exposes `/api/market/snapshot`, which proxies **free Yahoo Finance** charts and **FRED** series (no API key):

| Symbol / series | Use |
|-----------------|-----|
| `SPY` | Daily closes + ~10y up/down frequency |
| `ES=F` | E-mini S&P futures overnight lean |
| `^VIX` | Volatility day-over-day |
| `RSP` | Equal-weight S&P breadth proxy vs SPY |
| `^TNX` | 10-year yield pressure |
| `T10YIE` / `DFII10` | 10Y breakeven + real yield (FRED) |
| `CL=F` / `GC=F` | Oil + gold |

The UI shows a **Live · SPY · ES · VIX** pill when quotes load.

## Deploy on Netlify

1. Push this repo to GitHub.
2. In Netlify: **Add new site → Import an existing project** → pick the repo.
3. Build settings are already in `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Function: `netlify/functions/market-snapshot` (serves `/api/market/snapshot`)
4. Deploy, then open the `*.netlify.app` URL and confirm the Live pill works.
5. **Custom domain (GoDaddy):** Site configuration → Domain management → Add domain → set DNS at GoDaddy as Netlify instructs (A/ALIAS for apex, CNAME for `www`). Avoid “domain forwarding.”

Shared snapshot logic lives in `server/market-snapshot.ts` (Vite middleware + Netlify function).

## Notes

- Browser apps can't call Yahoo directly (CORS), so quotes go through `/api/market/snapshot` (local Vite middleware or Netlify Function).
- Educational probability signal only — not investment advice.
