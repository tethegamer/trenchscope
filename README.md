<p align="center"><img src="public/wordmark.svg" width="420" alt="On the Scope"></p>

# On the Scope

**The Solana screener that tells you if a token is a rug *before* you click it.**

DexScreener shows you charts. On the Scope shows you charts **plus a safety score on every single row** — mint/freeze authority, LP lock, real holder concentration, dev wallet and bundle/sniper detection — so you can filter the trenches down to tokens that aren't obvious traps.

> **Why the name?** "The trenches" is what Solana memecoin traders call the low-cap, high-risk market. Putting a token *on the scope* means looking at it through the crosshair before you jump in. (Formerly TrenchScope; the repo and Render service keep the old name.)

![desktop](docs/desktop.png)

<p><img src="docs/token.png" width="66%"> <img src="docs/mobile.png" width="30%"></p>

## What makes it better than DexScreener

| | DexScreener | On the Scope |
|---|---|---|
| Trending / new / gainers tables | ✅ | ✅ with liquidity · volume · mcap · age filters |
| Safety score on every row | ❌ | ✅ 0–100 badge + M / F / LP / T10 / BNDL pips |
| "Safe only" & "Hide bundled" toggles | ❌ | ✅ |
| Holder concentration (excluding pools/lockers) | ❌ | ✅ top-10 % + top holders bars |
| Dev wallet intel | ❌ | ✅ creator, % of supply held, SOL balance |
| Bundle / sniper heuristic | ❌ | ✅ linked-wallet clusters from RugCheck's transfer graph |
| Pump.fun live coins | ❌ | ✅ |
| OG vs VAMP tags for reused names | ❌ | ✅ 👑 OG badge, “VAMP” chip + “Vamp of X ↗” link, OG-only filter |
| Enhanced token info | $299 | **Scoped** $69 |
| Boosts | ~$99–$899 | $19 / $49 / $129 |
| Watchlist + price alerts | account needed | ✅ in-browser (localStorage + notifications), no login |
| One-click buy | ❌ | ✅ Jupiter, plus SafeSign deep scan |

## Features
- **Tables:** 🔥 Trending (GeckoTerminal trending pools + DexScreener boosts), ✨ New pairs (GeckoTerminal new pools + new DexScreener profiles), 🚀 Gainers (24h movers with ≥$5K liquidity), 🟢 Pump.fun live, ★ Watchlist. Sortable columns, 30s auto-refresh, filters persisted locally.
- **Safety score** (`lib/safety.js`, logic evolved from SafeSign's scanner): penalises active mint/freeze authority, concentrated top-10 holders (pools, lockers and burn accounts excluded), unlocked LP, large dev holdings, insider/bundle clusters, transfer fees, RugCheck "rugged" status and GoPlus flags (non-transferable, balance-mutable, closable). Any token with live mint/freeze authority or a bundle signal is capped at 65 so it can never show as "safe".
- **Token page:** TradingView lightweight-charts candlesticks (1m→1d) with volume, price/mcap/FDV/liquidity/volume/holders, 5m/1h/6h/24h change, live recent trades (wallet + tx links), all pools, safety flags, bundle check, dev wallet, holder bars, price alert form.
- **Search:** name, ticker or paste a mint (`/` to focus, arrow keys to navigate).
- **Quick links:** Jupiter, SafeSign (`https://safesign-pg8h.onrender.com`), DexScreener, Solscan, RugCheck, pump.fun.
- **Server-side caching:** every upstream call goes through a TTL cache with in-flight de-duplication, stale-on-error fallback, per-host throttling (GeckoTerminal ≈ 50/min) and retry on 429/5xx. Safety scans run in a background queue (2 workers) so tables load instantly and badges fill in.

## 👤 Profile (`/profile`, `public/profile.js` + `public/pnl-core.js`)
No login, no wallet signing — everything lives in `localStorage`.
- **Watchlist:** the same ★ list as the screener tab, with live prices.
- **Tracked wallets:** paste an address + label; shows SOL balance, last activity and the latest buys/sells (expand).
- **Wallet PnL (estimate):** reads the wallet's last 100–1,000 transactions in the browser (PublicNode RPC → Solana public RPC via `/api/rpc` proxy, or a custom RPC set in settings), turns balance changes into buys/sells (SOL, USDC, USDT quotes), values SOL legs at the SOL/USD price of the time (`/api/solprice`, GeckoTerminal) and open positions at live DexScreener prices. Average-cost realized + unrealized PnL, volume, win rate, 24h / 7d / 30d realized profit, daily bars, per-token table. Parsed transactions are cached per wallet so re-runs only fetch new ones. Excludes sells without a buy in the window, transfers/airdrops and token↔token swaps.
- **PnL card:** 1200×675 PNG drawn on canvas with the T-crosshair logo — download, copy, native share, or post to X.
- **Connect X:** placeholder (coming soon).

## 🎯 Scope Score (`lib/score.js`)
One 0–100 number on every token page (full breakdown) and as a compact chip in lists.
- **Coin fairness** (60%): insiders/linked wallets, bundles, launch snipers (first ~2 slots, scanned over Solana RPC), dev holdings + whether the dev sold, top-10 %, holders, LP lock, mint/freeze/fees. Labels: OK / NEUTRAL / SKETCHY / RIGGED. EVM chains use GoPlus.
- **Narrative** (40%, a *heuristic*): website reachable + content, domain age (RDAP), X / Telegram / Discord links, GitHub repo + recent commits. Labels: LIKELY REAL / PARTLY REAL / LIKELY LARP.
- Public JSON: `GET /api/score/:chain/:address` (`?quick=1` skips the launch scan). Cached 10 min. CORS open.
- Website fetching goes through `lib/safefetch.js` (blocks private/loopback IPs, size + time limits).
- Optional env: `SCORE_RPC` (faster Solana RPC for the launch scan; default PublicNode).

## 🤖 X reply bot (`lib/xbot.js`)
Tag the bot under a post with a contract address and it replies with the Scope Score + token link. Off until
`X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET` are set. Setup and costs: [docs/x-bot.md](docs/x-bot.md).

## ⚡ Buy on site (`public/buy.js`, `lib/jupiter.js`)

- Solana token pages have a **⚡ Buy … here** card, which is the official [Jupiter Plugin](https://dev.jup.ag/tool-kits/plugin) in integrated mode, set up for SOL → token. It loads when the user taps **Open swap** or the **⚡ Buy** button (or right away if they used it before). The buyer's wallet signs inside Jupiter; the server never handles keys or funds.
- `JUP_REFERRAL_ACCOUNT` adds a referral fee of `JUP_REFERRAL_FEE_BPS` (default 50 = 0.5%, allowed 50–255). It stays off until the account is set, and the card shows the fee to buyers. Setup steps are in **[docs/jupiter-referral.md](docs/jupiter-referral.md)**.
- `JUP_PLUGIN=0` hides the card. The **Buy on Jupiter ↗** link always works as a fallback, and the ⚡ Buy button also falls back to jup.ag if the plugin is off.
- `GET /api/config` returns `{ jup: { plugin, referralAccount, feeBps } }`.

## 🧠 Smart money tags (`data/smart-wallets.js`)

- A short curated list of **public KOL wallets** (20 today). Every address has a comment citing where it was publicly attributed (kolscan.io account pages, some cross-checked against a public Hugging Face dataset). Only add addresses you can verify that way. Set `SMART_MONEY=0` to turn the list off.
- `lib/wallettracker.js` polls those wallets (plus every wallet a visitor tracks in Profile → Wallets) through the Solana RPC and parses swaps. KOL wallets that appear in a token's live trade feed also count.
- Screener rows and cards get a **🧠 N** chip (N = KOLs who bought in the last 24h) and a **👛 You** chip when one of your own tracked wallets bought. The **🧠 Smart money** toggle filters to those tokens. Token pages show a "Smart money bought" strip with each buy and sell (wallet name, SOL amount, time, Solscan link), and KOL wallets are named in Recent trades.
- API: `GET /api/smart?w=addr1,addr2` returns a per-token summary, and `GET /api/smart/:mint?w=…` returns the events for one token. The server only returns names from the public list; it never shows anyone else's tracked wallets.
- Tuning: `WALLET_POLL_PER_TICK` (default 8 wallets every 20s). For faster coverage, set `SCORE_RPC` to a private RPC such as Helius or QuickNode.
- Limits: history lives in memory (24h window), so it starts again after each restart or deploy and fills back in a few minutes. Busy KOL wallets get a lot of spam or failed transactions, so some trades can be missed. This is a hint, not a signal to copy.

## 🔔 Alerts (`lib/alerts.js`, `lib/wallettracker.js`, `public/alerts-client.js`, `public/sw.js`)
Profile → **Alerts** sends pings even when the site is closed, by **web push** and/or **Telegram**:
price targets, watchlist moves (±5–50%), tracked-wallet buys/sells, Valid Vamp gained/lost, and new OG migrations.
The browser keeps a random id and re-syncs its watchlist / wallets / targets to the server (stored in `data/alerts.json`).
- **Web push** needs `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` (run `npx web-push generate-vapid-keys` once, paste both into Render's
  Environment tab) and optionally `VAPID_SUBJECT` (`mailto:you@example.com`). If they're missing the server generates temporary keys and
  logs a warning — push still works but every redeploy changes the keys and devices must tap *Turn on* again. Keys are never committed.
- **Telegram**: create a bot with [@BotFather](https://t.me/BotFather) → `/newbot`, put the token in `TELEGRAM_ALERTS_BOT_TOKEN`.
  Users tap *Link Telegram* (opens `t.me/<bot>?start=<code>`); `/stop` unlinks. Without the token the Telegram option shows "Soon".
- iPhone/iPad: web push only works after *Share → Add to Home Screen* (iOS 16.4+); the tab explains this.
- Render's free disk is wiped on deploy; browsers re-sync automatically on their next visit, Telegram links are restored from a signed token.

## 📲 Install as an app (PWA: `public/manifest.webmanifest`, `public/sw.js`, `public/pwa.js`)
- Android / desktop Chrome, Edge, Brave: tap the **⬇ install icon** in the header (or the "Get the app" banner on the 2nd visit) for the native install prompt.
- iPhone / iPad: the same button opens step-by-step **Share → Add to Home Screen** instructions (and warns if you're inside the X/Telegram in-app browser). Installing is also what unlocks push alerts on iOS.
- T-crosshair icons: 192, 512, maskable 512 (safe-zone padded) and a 180 Apple touch icon. Shortcuts for Watchlist and Alerts.
- **No stale prices, ever:** the service worker never touches `/api/*`, non-GET requests or other origins. Those always go to the network. Pages and JS/CSS are network-first, with the cached copy used only offline (an offline page says prices are paused). Bump `VERSION` in `sw.js` to purge old caches.

## 👑 OG vs VAMP (`lib/og.js`)
When a coin pumps, vamps relaunch the same name/ticker. On the Scope finds every Solana token with the same identity and marks the **first one to graduate** as **OG**; later ones get a **VAMP** tag (“Vamp: reused a name that already graduated earlier”) that links to the OG.
- **Normalization:** lowercase, accents/emojis/`$`/punctuation/spaces stripped, leading “the”, one trailing suffix (`coin`, `token`, `official`, `sol`, `onsol`, `fun`, `ai`) removed — `streamoors.fun` = `Streamoors`, `The BONK Coin 🚀` = `bonk`.
- **Same identity:** same normalized name, or same ticker AND one name contains the other (so `Streamflow` ≠ `streamoors` even though both are `STREAM`).
- **Candidates:** DexScreener search by name and by ticker, then *all* pairs of every candidate via `/tokens/v1`.
- **Graduation time:** earliest Raydium or PumpSwap pair (`pairCreatedAt`) — where pump.fun coins migrate when the curve completes. Earliest graduate = OG.
- Only migrated tokens are tagged: anything still on the pump.fun bonding curve (no PumpSwap/Raydium pair) gets no OG/VAMP tag.
- **VV (Valid Vamp):** a VAMP whose smoothed market cap (median of ≥3 samples over 4h, spanning ≥1h) is ≥5x the OG's and that is ≥24h old gets a green/gold **VV** chip (“Valid Vamp: flipped the OG 5x+”); the OG page shows “Flipped by …”. Dynamic — lost when it falls back under 5x. Mcap samples come from list refreshes and a 10-min background sampler.
- Results are cached persistently in `data/og-cache.json` (6h TTL) and computed in a background queue.
- Real example (verified 16 Oct 2026): trending **FTR “Flying Tesla Roadster”** (`DFMt…pump`, PumpSwap 14 Oct) is marked **Vamp of FTR `3w5c…`**, which had a Raydium pair since 14 Aug 2026.

## 💸 Monetization (Solana Pay, USDC or SOL)
| Product | Price | DexScreener |
|---|---|---|
| **Scoped** — logo, banner, description, website/X/Telegram + crosshair “Scoped” badge, reviewed before going live | $69 one-time | $299 Enhanced Token Info |
| ⚡ 10x Boost | $19 / 12h | ~$99 / 12h* |
| ⚡ 30x Boost | $49 / 24h | ~$249 / 12h* |
| ⚡ 100x Boost | $129 / 24h | ~$899 / 24h* |

\*commonly reported prices; DexScreener only shows boost prices in its own dialog.
- Buyers order on **/advertise** → get Solana Pay QR codes / wallet links (USDC exact amount, or SOL quoted live and valid 1h) → `/order/:id` polls and verifies on-chain.
- **No private keys.** Each payment option has a unique `reference` pubkey; the server looks up transactions with it via public RPC and checks the owner wallet’s USDC/SOL balance delta (logic adapted from SafeSign). A signature can only pay one order.
- Boosts activate instantly, pin the token higher in Trending (ordered by active boosts) and are labelled **⚡ Promoted / AD**. DexScreener’s own boosts are shown separately as **DS⚡**. Boosts are refused for tokens our scanner rates high-risk.
- Scoped orders go to **review**; the owner approves/rejects at **/admin** (`ADMIN_PASSWORD` env, timing-safe compare, lockout after 10 failures). Only approved info is shown.
- Orders persist in `data/orders.json` (`ORDERS_FILE` to change).

## 🌐 Multi-chain
Chain picker (bottom sheet with search) — Solana (default) plus Robinhood, BNB Chain, Ethereum, Base, Polygon, PulseChain, NEAR, Avalanche, Sonic, Starknet, Monad, World Chain, Hyperliquid, HyperEVM, Tron, Hedera, TON, Cronos, Sui, XRPL, Ink, Arbitrum, Abstract, Optimism, ICP, zkSync, Linea, Plasma, Injective and "All chains". Trending / New / Gainers and token pages (chart, trades, pools) use GeckoTerminal networks + DexScreener chain IDs (`lib/chains.js`). MultiversX is skipped (no GeckoTerminal network). Safety score, OG/VAMP/VV, dev wallet, holders, alerts, Jupiter, SafeSign and Scoped stay Solana-only.

## Data sources (all free, no keys)
DexScreener (`/tokens/v1`, `/latest/dex/search`, token-boosts, token-profiles) · GeckoTerminal (trending/new pools, OHLCV, trades) · pump.fun frontend API · RugCheck report API · GoPlus Solana token security · Solana public RPC (`getBalance`). Nothing shown in the UI is invented — when a source has no value the UI shows "—".

## Run
```bash
npm install
npm start          # http://localhost:3000  (PORT env to change)
npm test           # payment verification (real historical txs) + OG tests + live API smoke test
```
Env: `SOLANA_RPC` (default public mainnet RPC), `ADMIN_PASSWORD` (enables /admin), `PAY_WALLET` (owner wallet, default `EL63Jz5kAamGAFtwiunvCJsFcAZWGUmagPTHZTrcPVv6`), `ORDERS_FILE`, `OG_CACHE_FILE`.

## Deploy (Render free)
Push the repo, then **New → Blueprint** in Render and select it — `render.yaml` sets up a free Node web service with a `/api/health` check.

## Limitations
- Bundle/sniper detection is a heuristic built on RugCheck's insider-network data, not an analysis of first-block buys.
- "Other tokens created" by the dev only shows when RugCheck reports it.
- Gainers are computed over the tracked universe (trending + new + boosted), not every Solana pair.
- Pump.fun's frontend API is unofficial and may change or block datacenter IPs.
- Free public APIs rate-limit; on a busy instance safety badges may take a minute to fill in.
- Alerts only fire while an On the Scope tab is open (no push server).
- OG detection only sees tokens DexScreener search returns (~30 pairs per query); very common names may miss older tokens. Raydium pairs are treated as graduations even for tokens launched directly on Raydium. pump.fun's search API ignores the search term from servers, so it isn't used.
- **Render free has no persistent disk:** `data/orders.json` and the OG cache are wiped on redeploy/restart. For real sales, attach a Render disk (paid) or point `ORDERS_FILE` to persistent storage, and back up orders. On-chain payments themselves are never lost — an order can be re-verified from its reference.
- Scoped assets are submitted as https URLs (no file upload/hosting); rejected-order refunds are manual.
- Not financial advice. Scores are heuristics.

MIT licensed.

## Live New pairs

The **New pairs** tab streams in real time. The server keeps one websocket to PumpPortal (`subscribeNewToken`), so every pump.fun and LetsBonk launch shows up within about a second of hitting the chain. It also polls GeckoTerminal new pools every 15s, but only while someone is watching. New coins reach browsers over Server-Sent Events (`GET /api/live/new?chain=solana`) and slide in under a **LIVE** indicator. If you've scrolled down, they wait behind an "↑ N new coins" pill so the list doesn't jump. `GET /api/live/status` shows the feed's health. All of these are optional:

| env | default | |
|---|---|---|
| `LIVE_FEED` | on | `0` turns the PumpPortal websocket off |
| `PUMPPORTAL_WS` | `wss://pumpportal.fun/api/data` | Override the feed URL |
| `DEX_POLL_MS` | `15000` | DEX new-pool poll interval while viewers are connected (minimum 8000) |

## Top Callers

`/callers` (the **📣 Top Callers** tab) tracks 123 public wallets (`data/smart-wallets.js`, each one cited):
- 27 pump.fun callers (`cat: 'caller'`, verified on pump.fun's public profile API)
- 96 KOL / top traders (`cat: 'trader'`, from the kolscan.io leaderboard)

The page shows:
- a leaderboard with pump.fun 2x hit rate and kolscan 30d PnL (snapshot in `data/caller-stats.json`)
- live recent buys, with an approximate entry mcap
- 📣 caller chips on list rows, token pages and trades

`GET /api/callers` serves the data.

Polling scales without extra RPC load:
- `WALLET_POLL_PER_TICK` wallets per 20s tick (default 8). About half of each tick goes to wallets that traded in the last 30 min; the rest rotate through everyone.
- Per-wallet signature checkpoints, and at most 15 transactions read per poll.
- `SMART_BACKFILL` sets how many transactions to read on a wallet's first look (default 5).
