# TrenchScope 🔭

**The Solana screener that tells you if a token is a rug *before* you click it.**

DexScreener shows you charts. TrenchScope shows you charts **plus a safety score on every single row** — mint/freeze authority, LP lock, real holder concentration, dev wallet and bundle/sniper detection — so you can filter the trenches down to tokens that aren't obvious traps.

> **Why the name?** "The trenches" is what Solana memecoin traders call the low-cap, high-risk market. A *scope* lets you see what's in there before you jump in. Short, memorable, and it says what the product does.

![desktop](docs/desktop.png)

<p><img src="docs/token.png" width="66%"> <img src="docs/mobile.png" width="30%"></p>

## What makes it better than DexScreener

| | DexScreener | TrenchScope |
|---|---|---|
| Trending / new / gainers tables | ✅ | ✅ with liquidity · volume · mcap · age filters |
| Safety score on every row | ❌ | ✅ 0–100 badge + M / F / LP / T10 / BNDL pips |
| "Safe only" & "Hide bundled" toggles | ❌ | ✅ |
| Holder concentration (excluding pools/lockers) | ❌ | ✅ top-10 % + top holders bars |
| Dev wallet intel | ❌ | ✅ creator, % of supply held, SOL balance |
| Bundle / sniper heuristic | ❌ | ✅ linked-wallet clusters from RugCheck's transfer graph |
| Pump.fun live coins | ❌ | ✅ |
| Watchlist + price alerts | account needed | ✅ in-browser (localStorage + notifications), no login |
| One-click buy | ❌ | ✅ Jupiter / Photon, plus SafeSign deep scan |

## Features
- **Tables:** 🔥 Trending (GeckoTerminal trending pools + DexScreener boosts), ✨ New pairs (GeckoTerminal new pools + new DexScreener profiles), 🚀 Gainers (24h movers with ≥$5K liquidity), 🟢 Pump.fun live, ★ Watchlist. Sortable columns, 30s auto-refresh, filters persisted locally.
- **Safety score** (`lib/safety.js`, logic evolved from SafeSign's scanner): penalises active mint/freeze authority, concentrated top-10 holders (pools, lockers and burn accounts excluded), unlocked LP, large dev holdings, insider/bundle clusters, transfer fees, RugCheck "rugged" status and GoPlus flags (non-transferable, balance-mutable, closable). Any token with live mint/freeze authority or a bundle signal is capped at 65 so it can never show as "safe".
- **Token page:** TradingView lightweight-charts candlesticks (1m→1d) with volume, price/mcap/FDV/liquidity/volume/holders, 5m/1h/6h/24h change, live recent trades (wallet + tx links), all pools, safety flags, bundle check, dev wallet, holder bars, price alert form.
- **Search:** name, ticker or paste a mint (`/` to focus, arrow keys to navigate).
- **Quick links:** Jupiter, Photon, SafeSign (`https://safesign-pg8h.onrender.com`), DexScreener, Solscan, RugCheck, pump.fun.
- **Server-side caching:** every upstream call goes through a TTL cache with in-flight de-duplication, stale-on-error fallback, per-host throttling (GeckoTerminal ≈ 50/min) and retry on 429/5xx. Safety scans run in a background queue (2 workers) so tables load instantly and badges fill in.

## Data sources (all free, no keys)
DexScreener (`/tokens/v1`, `/latest/dex/search`, token-boosts, token-profiles) · GeckoTerminal (trending/new pools, OHLCV, trades) · pump.fun frontend API · RugCheck report API · GoPlus Solana token security · Solana public RPC (`getBalance`). Nothing shown in the UI is invented — when a source has no value the UI shows "—".

## Run
```bash
npm install
npm start          # http://localhost:3000  (PORT env to change)
npm test           # live smoke test against the real APIs
```
Optional env: `SOLANA_RPC` (defaults to `https://api.mainnet-beta.solana.com`).

## Deploy (Render free)
Push the repo, then **New → Blueprint** in Render and select it — `render.yaml` sets up a free Node web service with a `/api/health` check.

## Limitations
- Bundle/sniper detection is a heuristic built on RugCheck's insider-network data, not an analysis of first-block buys.
- "Other tokens created" by the dev only shows when RugCheck reports it.
- Gainers are computed over the tracked universe (trending + new + boosted), not every Solana pair.
- Pump.fun's frontend API is unofficial and may change or block datacenter IPs.
- Free public APIs rate-limit; on a busy instance safety badges may take a minute to fill in.
- Alerts only fire while a TrenchScope tab is open (no push server).
- Not financial advice. Scores are heuristics.

MIT licensed.
