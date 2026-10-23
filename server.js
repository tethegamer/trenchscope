// On the Scope — Solana token screener with safety intel on every row.
const express = require('express');
const compression = require('compression');
const path = require('path');
const { scoreReport } = require('./lib/safety');
const { createOG } = require('./lib/og');
const chains = require('./lib/chains');
const pay = require('./lib/payments');
const crypto = require('crypto');
const QRCode = require('qrcode');
const scoreLib = require('./lib/score');
const { safeFetch } = require('./lib/safefetch');

const PORT = process.env.PORT || 3000;
const RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const UA = { 'User-Agent': 'OnTheScope/1.0 (+https://github.com/tethegamer/trenchscope)', Accept: 'application/json' };

// ---------- cache with in-flight dedupe + stale-on-error ----------
const store = new Map();
async function cached(key, ttlMs, fn) {
  const hit = store.get(key);
  const now = Date.now();
  if (hit && hit.value !== undefined && now - hit.at < ttlMs) return hit.value;
  if (hit && hit.pending) return hit.pending;
  const pending = (async () => {
    try {
      const value = await fn();
      store.set(key, { value, at: Date.now() });
      return value;
    } catch (e) {
      if (hit && hit.value !== undefined) { store.set(key, { value: hit.value, at: hit.at }); return hit.value; }
      store.delete(key);
      throw e;
    }
  })();
  store.set(key, { ...(hit || {}), pending });
  return pending;
}
setInterval(() => { // evict entries older than 1h
  const cut = Date.now() - 3600e3;
  for (const [k, v] of store) if (!v.pending && v.at < cut) store.delete(k);
}, 600e3).unref();

// ---------- rate-limited fetch per host ----------
const limits = { 'api.geckoterminal.com': 2200, 'api.rugcheck.xyz': 700, 'api.dexscreener.com': 220, default: 100 };
// Priority-aware per-host throttle: user-facing requests (charts, trades) jump ahead of background work
// (list refreshes, prefetch). After a 429 the host enters a short cooldown.
const hosts = {};
const H = host => hosts[host] || (hosts[host] = { last: 0, q: [], timer: null, cooldownUntil: 0 });
function pump(host) {
  const h = H(host);
  if (h.timer || !h.q.length) return;
  const gap = limits[host] ?? limits.default;
  const wait = Math.max(h.last + gap, h.cooldownUntil) - Date.now();
  h.timer = setTimeout(() => {
    h.timer = null;
    h.q.sort((a, b) => b.prio - a.prio || a.seq - b.seq);
    const job = h.q.shift();
    if (job) { h.last = Date.now(); job.resolve(); }
    pump(host);
  }, Math.max(0, wait));
}
let seq = 0;
function throttle(host, prio = 0, key) {
  return new Promise(resolve => { H(host).q.push({ prio, seq: seq++, resolve, key }); pump(host); });
}
// raise the priority of an already-queued request (e.g. a background safety scan the user is now waiting on)
function bump(url, prio) { const h = H(new URL(url).host); for (const j of h.q) if (j.key === url && j.prio < prio) j.prio = prio; }
const PRIO = { high: 10, normal: 0, low: -10 };
async function getJSON(url, opts = {}, attempt = 0) {
  try { return await getJSONOnce(url, opts); } catch (e) {
    const is429 = /HTTP 429/.test(e.message);
    if (is429) H(new URL(url).host).cooldownUntil = Date.now() + 8000;
    const maxTries = opts.prio >= PRIO.high ? 1 : 3; // user-facing: fail fast so the UI can fall back
    if (attempt < maxTries && /HTTP (429|5\d\d)/.test(e.message)) { await new Promise(r => setTimeout(r, (is429 ? 4000 : 1500) * (attempt + 1))); return getJSON(url, opts, attempt + 1); }
    throw e;
  }
}
async function getJSONOnce(url, { timeout = 15000, method = 'GET', body, prio = PRIO.normal } = {}) {
  const host = new URL(url).host;
  await throttle(host, prio, url);
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { method, body, headers: { ...UA, ...(body ? { 'Content-Type': 'application/json' } : {}) }, signal: ctl.signal });
    if (!r.ok) throw new Error(`${host} HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}
const gtQueueDepth = () => H('api.geckoterminal.com').q.length;

// ---------- normalizers ----------
const num = v => (v === null || v === undefined || v === '' || isNaN(+v) ? null : +v);
function fromDex(p) {
  return {
    mint: p.baseToken.address, symbol: p.baseToken.symbol, name: p.baseToken.name,
    pair: p.pairAddress, dex: p.dexId, quote: p.quoteToken?.symbol,
    icon: p.info?.imageUrl || null, header: p.info?.header || null,
    priceUsd: num(p.priceUsd), priceNative: num(p.priceNative),
    change: { m5: num(p.priceChange?.m5), h1: num(p.priceChange?.h1), h6: num(p.priceChange?.h6), h24: num(p.priceChange?.h24) },
    volume: { m5: num(p.volume?.m5), h1: num(p.volume?.h1), h6: num(p.volume?.h6), h24: num(p.volume?.h24) },
    txns: p.txns || null, liquidity: num(p.liquidity?.usd), mcap: num(p.marketCap), fdv: num(p.fdv),
    createdAt: p.pairCreatedAt || null, boosts: p.boosts?.active || 0, chain: p.chainId,
    websites: p.info?.websites || [], socials: p.info?.socials || [], labels: p.labels || [], src: 'dexscreener',
  };
}
function fromGecko(pool) {
  const a = pool.attributes; const rel = pool.relationships;
  const { net, addr: mint } = chains.splitGtId(rel.base_token.data.id);
  const [sym] = (a.name || '').split(' / ');
  const tx = a.transactions || {};
  const t = k => tx[k] ? { buys: tx[k].buys, sells: tx[k].sells } : undefined;
  return {
    mint, symbol: sym, name: sym, pair: a.address, dex: rel.dex?.data?.id, quote: (a.name || '').split(' / ')[1],
    icon: null, priceUsd: num(a.base_token_price_usd), priceNative: num(a.base_token_price_native_currency),
    change: { m5: num(a.price_change_percentage?.m5), h1: num(a.price_change_percentage?.h1), h6: num(a.price_change_percentage?.h6), h24: num(a.price_change_percentage?.h24) },
    volume: { m5: num(a.volume_usd?.m5), h1: num(a.volume_usd?.h1), h6: num(a.volume_usd?.h6), h24: num(a.volume_usd?.h24) },
    txns: { m5: t('m5'), h1: t('h1'), h6: t('h6'), h24: t('h24') }, liquidity: num(a.reserve_in_usd),
    mcap: num(a.market_cap_usd), fdv: num(a.fdv_usd), createdAt: a.pool_created_at ? Date.parse(a.pool_created_at) : null,
    boosts: 0, websites: [], socials: [], labels: [], src: 'geckoterminal', chain: chains.byGt[net]?.id || net,
  };
}

// ---------- data sources ----------
async function dexTokens(mints) {
  const out = new Map();
  const uniq = [...new Set(mints)].filter(Boolean);
  for (let i = 0; i < uniq.length; i += 30) {
    const chunk = uniq.slice(i, i + 30);
    const key = 'dst:' + chunk.join(',');
    let pairs = [];
    try { pairs = await cached(key, 45e3, () => getJSON(`https://api.dexscreener.com/tokens/v1/solana/${chunk.join(',')}`)); } catch { continue; }
    for (const p of pairs || []) {
      if (p.chainId !== 'solana') continue;
      const m = p.baseToken.address;
      if (!chunk.includes(m)) continue;
      const cur = out.get(m);
      if (!cur || (p.liquidity?.usd || 0) > (cur.liquidity?.usd || 0)) out.set(m, p);
    }
  }
  return out;
}
async function geckoPools(kind, pages = 3) {
  const all = [];
  for (let page = 1; page <= pages; page++) {
    try {
      const d = await cached(`gt:${kind}:${page}`, 90e3, () => getJSON(`https://api.geckoterminal.com/api/v2/networks/solana/${kind}?page=${page}`, { prio: PRIO.low }));
      all.push(...(d.data || []));
    } catch { break; }
  }
  return all.map(fromGecko);
}
const SKIP = new Set(['So11111111111111111111111111111111111111112', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'Es9vMFrzaCERmJrfKbg1RKUuu1xDWDH7q8zWZXbFmVCx']);
async function enrich(base) {
  const seen = new Set(); const list = [];
  for (const r of base) { if (!SKIP.has(r.mint) && !seen.has(r.mint)) { seen.add(r.mint); list.push(r); } }
  const ds = await dexTokens(list.map(r => r.mint));
  return list.map(r => {
    const p = ds.get(r.mint);
    if (!p) return r;
    const d = fromDex(p);
    // keep the earliest known creation time (GT pool vs DS best pair)
    return { ...d, createdAt: d.createdAt || r.createdAt };
  });
}
async function boostedMints() {
  const [top, latest, profiles] = await Promise.all([
    cached('ds:boost-top', 120e3, () => getJSON('https://api.dexscreener.com/token-boosts/top/v1')).catch(() => []),
    cached('ds:boost-latest', 120e3, () => getJSON('https://api.dexscreener.com/token-boosts/latest/v1')).catch(() => []),
    cached('ds:profiles', 120e3, () => getJSON('https://api.dexscreener.com/token-profiles/latest/v1')).catch(() => []),
  ]);
  const sol = a => (a || []).filter(x => x.chainId === 'solana').map(x => x.tokenAddress);
  return { boosted: [...sol(top), ...sol(latest)], profiles: sol(profiles) };
}
const lists = {
  trending: () => cached('list:trending', 60e3, async () => {
    const [gt, b] = await Promise.all([geckoPools('trending_pools', 2), boostedMints()]);
    const base = [...gt, ...b.boosted.map(mint => ({ mint }))];
    return (await enrich(base)).filter(r => r.pair);
  }),
  new: () => cached('list:new', 45e3, async () => {
    const [gt, b] = await Promise.all([geckoPools('new_pools', 2), boostedMints()]);
    const base = [...gt, ...b.profiles.map(mint => ({ mint }))];
    const rows = (await enrich(base)).filter(r => r.pair && r.createdAt);
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  }),
  gainers: () => cached('list:gainers', 60e3, async () => {
    const [t, n] = await Promise.all([lists.trending(), lists.new()]);
    const m = new Map(); [...t, ...n].forEach(r => m.set(r.mint, r));
    return [...m.values()].filter(r => (r.liquidity || 0) >= 5000 && r.change.h24 != null).sort((a, b) => b.change.h24 - a.change.h24);
  }),
  pumpfun: () => cached('list:pumpfun', 45e3, async () => {
    const d = await getJSON('https://frontend-api-v3.pump.fun/coins/currently-live?limit=60&offset=0&includeNsfw=false');
    const base = (d || []).map(c => ({
      mint: c.mint, symbol: c.symbol, name: c.name, icon: c.image_uri || null,
      mcap: num(c.usd_market_cap), createdAt: c.created_timestamp || null, complete: !!c.complete,
      replies: c.reply_count ?? null, creator: c.creator, pair: c.pump_swap_pool || c.bonding_curve || null,
      dex: c.complete ? 'pumpswap' : 'pump.fun curve', liveViewers: c.num_participants ?? null,
      change: {}, volume: {}, liquidity: null, priceUsd: null, src: 'pump.fun', websites: c.website ? [{ url: c.website }] : [],
      socials: [c.twitter && { type: 'twitter', url: c.twitter }, c.telegram && { type: 'telegram', url: c.telegram }].filter(Boolean),
    }));
    // overlay live DexScreener stats where a DEX pair exists (keeps pump.fun-only fields)
    const ds = await dexTokens(base.map(r => r.mint));
    return base.map(r => { const p = ds.get(r.mint); if (!p) return r; const x = fromDex(p); return { ...r, ...x, icon: x.icon || r.icon, createdAt: r.createdAt || x.createdAt, src: 'pump.fun+dexscreener' }; });
  }),
};

// ---------- safety (RugCheck + GoPlus) with background queue ----------
const safetyQ = []; const queued = new Set();
async function rugReport(mint, prio = PRIO.low) {
  if (prio > PRIO.low) bump(`https://api.rugcheck.xyz/v1/tokens/${mint}/report`, prio);
  return cached('rc:' + mint, 15 * 60e3, () => getJSON(`https://api.rugcheck.xyz/v1/tokens/${mint}/report`, { timeout: 25000, prio }));
}
async function goplus(mint) {
  return cached('gp:' + mint, 30 * 60e3, async () => {
    const d = await getJSON(`https://api.gopluslabs.io/api/v1/solana/token_security?contract_addresses=${mint}`, { prio: PRIO.high, timeout: 8000 });
    return d?.result?.[mint] || null;
  });
}
async function safetyFor(mint, withGoplus = false, prio = PRIO.low) {
  return cached('sf:' + mint + (withGoplus ? ':gp' : ''), 15 * 60e3, async () => {
    const [rc, gp] = await Promise.all([rugReport(mint, prio), withGoplus ? goplus(mint).catch(() => null) : null]);
    return scoreReport(rc, gp);
  });
}
function peekSafety(mint) { const h = store.get('sf:' + mint) || store.get('sf:' + mint + ':gp'); return h && h.value; }
function enqueue(mints) { for (const m of mints) if (m && !queued.has(m) && !peekSafety(m)) { queued.add(m); safetyQ.push(m); } }
let workers = 0;
async function worker() {
  workers++;
  while (safetyQ.length) {
    const m = safetyQ.shift();
    try { await safetyFor(m); } catch { store.set('sf:' + m, { value: { unavailable: true }, at: Date.now() - 13 * 60e3 }); }
    queued.delete(m);
  }
  workers--;
}
setInterval(() => { while (workers < 2 && safetyQ.length) worker(); }, 300).unref();

// ---------- OG / VAMP queue ----------
const og = createOG({ getJSON: (u, o = {}) => getJSON(u, { ...o, prio: PRIO.low }), cached, file: process.env.OG_CACHE_FILE || path.join(__dirname, 'data', 'og-cache.json') });
const ogQ = []; const ogQueued = new Set(); let ogBusy = false;
function enqueueOG(rows) { for (const r of rows) if (r && r.mint && r.name && !ogQueued.has(r.mint) && !og.peek(r.mint)) { ogQueued.add(r.mint); ogQ.push({ mint: r.mint, name: r.name, symbol: r.symbol }); } }
setInterval(async () => {
  if (ogBusy || !ogQ.length) return; ogBusy = true;
  const t = ogQ.shift();
  try { if (!og.peek(t.mint)) await og.check(t); } catch {} finally { ogQueued.delete(t.mint); ogBusy = false; }
}, 250).unref();
const withIntel = (r, boosts = pay.activeBoosts(), scoped = pay.scopedMints()) => ({ ...r, safety: peekSafety(r.mint) || null, score: peekScore('solana', r.mint), og: og.peek(r.mint) || null, promo: boosts[r.mint] || 0, scope: scoped.has(r.mint) });

// ---------- Solana RPC ----------
async function rpc(method, params) {
  const d = await getJSON(RPC, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  if (d.error) throw new Error(d.error.message);
  return d.result;
}

// ---------- Scope Score ----------
// Fast public RPC for the launch scan (PublicNode handles many getTransaction calls/sec); falls back to SOLANA_RPC.
const FAST_RPC = process.env.SCORE_RPC || 'https://solana-rpc.publicnode.com';
async function solRpc(method, params, prio = PRIO.normal) {
  try {
    const d = await getJSON(FAST_RPC, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), timeout: 12000, prio });
    if (d.error) throw new Error(d.error.message);
    return d.result;
  } catch (e) { return rpc(method, params); }
}
limits[new URL(FAST_RPC).host] = 40;
const scorer = scoreLib.createScorer({ getJSON: (u, o = {}) => getJSON(u, { prio: PRIO.low, ...o }), safeFetch, cached, solRpc });
const GOPLUS_IDS = { ethereum: 1, bsc: 56, base: 8453, polygon: 137, avalanche: 43114, arbitrum: 42161, optimism: 10, cronos: 25, zksync: 324, linea: 59144, sonic: 146, worldchain: 480, abstract: 2741 };
const SCORE_TTL = 10 * 60e3;
function scoreKey(chain, addr) { return `score:${chain}:${chain === 'solana' ? addr : addr.toLowerCase()}`; }
// full=true also runs the launch (sniper / dev-sold) scan; background list scoring skips it.
async function scoreFor(chain, addr, { full = true, prio = PRIO.low } = {}) {
  const key = scoreKey(chain, addr);
  const hit = store.get(key);
  if (hit?.value && Date.now() - hit.at < SCORE_TTL && (hit.value.full || !full)) return hit.value;
  if (hit?.pending && (hit.full || !full)) return hit.pending;
  const pending = (async () => {
    let coin = null, links = { websites: [], socials: [] }, description = '', symbol = null, name = null;
    if (chain === 'solana') {
      const [rep, pairs] = await Promise.all([
        safetyFor(addr, true, prio).catch(() => null),
        cached('dsp:' + addr, 30e3, () => getJSON(`https://api.dexscreener.com/tokens/v1/solana/${addr}`, { prio })).catch(() => []),
      ]);
      const p = (pairs || []).filter(x => x.baseToken?.address === addr).sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
      const withInfo = p.find(x => x.info?.websites?.length || x.info?.socials?.length) || p[0];
      links = { websites: withInfo?.info?.websites || [], socials: withInfo?.info?.socials || [] };
      symbol = p[0]?.baseToken?.symbol || rep?.symbol; name = p[0]?.baseToken?.name || rep?.name;
      const pump = store.get('pf:' + addr)?.value; if (pump?.description) description = pump.description;
      let early = null;
      if (full && rep && !rep.unavailable) {
        const rc = store.get('rc:' + addr)?.value;
        early = await Promise.race([scorer.earlyScan(addr, rep.creator, rc?.topHolders, rep.supply), new Promise(r => setTimeout(() => r({ unavailable: 'Launch scan still running — refresh in a minute' }), 15000))]).catch(e => ({ unavailable: 'Launch scan failed (' + e.message.slice(0, 40) + ')' }));
        if (early?.unavailable && /running/.test(early.unavailable)) setTimeout(() => store.delete(key), 1000).unref?.();
      }
      if (!p.length && (!rep || rep.unavailable)) { const e = new Error('Token not found — no pairs or safety data yet'); e.status = 404; throw e; }
      coin = scoreLib.coinSolana(rep, early);
      if (coin && early && !early.unavailable) coin.early = early;
    } else {
      const pairs = await cached(`dsp:${chain}:${addr.toLowerCase()}`, 30e3, () => getJSON(`https://api.dexscreener.com/tokens/v1/${chain}/${addr}`, { prio })).catch(() => []);
      const p = (pairs || []).filter(x => String(x.baseToken?.address).toLowerCase() === addr.toLowerCase());
      const withInfo = p.find(x => x.info?.websites?.length || x.info?.socials?.length) || p[0];
      links = { websites: withInfo?.info?.websites || [], socials: withInfo?.info?.socials || [] };
      symbol = p[0]?.baseToken?.symbol; name = p[0]?.baseToken?.name;
      if (!p.length) { const e = new Error('Token not found on DexScreener for this chain'); e.status = 404; throw e; }
      const id = GOPLUS_IDS[chain];
      if (id && /^0x[0-9a-fA-F]{40}$/.test(addr)) {
        const g = await cached(`gpe:${id}:${addr.toLowerCase()}`, 30 * 60e3, async () => (await getJSON(`https://api.gopluslabs.io/api/v1/token_security/${id}?contract_addresses=${addr}`, { prio, timeout: 10000 }))?.result?.[addr.toLowerCase()] || null).catch(() => null);
        coin = scoreLib.coinEvm(g);
      }
    }
    const narr = await scorer.narrativeFor({ ...links, description });
    const out = { chain, address: addr, symbol, name, ...scoreLib.combine(coin, narr), full };
    store.set(key, { value: out, at: Date.now() });
    return out;
  })().catch(e => { const h = store.get(key); if (h?.value) store.set(key, { value: h.value, at: h.at }); else store.delete(key); throw e; });
  store.set(key, { ...(hit || {}), pending, full });
  return pending;
}
// ---------- X reply bot (disabled unless X_API_KEY/X_API_SECRET/X_ACCESS_TOKEN/X_ACCESS_SECRET are set) ----------
const { createXBot } = require('./lib/xbot');
async function resolveToken({ address, chain, viaPair }) {
  // a DexScreener link may carry a pair address — map it to the base token
  if (viaPair && chain) {
    const j = await cached(`dpair:${chain}:${address}`, 10 * 60e3, () => getJSON(`https://api.dexscreener.com/latest/dex/pairs/${chain}/${address}`)).catch(() => null);
    const p = j?.pairs?.[0] || j?.pair; if (p?.baseToken?.address) return { chain: p.chainId, address: p.baseToken.address };
  }
  if (chain === 'solana' && !viaPair) return { chain, address };
  const pairs = await cached('dsany:' + address.toLowerCase(), 10 * 60e3, () => getJSON(`https://api.dexscreener.com/latest/dex/tokens/${address}`)).catch(() => null);
  const best = (pairs?.pairs || []).filter(p => String(p.baseToken?.address).toLowerCase() === address.toLowerCase() && (p.chainId === 'solana' || chains.byId[p.chainId])).sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
  return best ? { chain: best.chainId, address: best.baseToken.address } : null;
}
const publicBase = () => String(process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
const xbot = createXBot({ scoreFor: (c, a) => scoreFor(c, a, { full: true, prio: PRIO.normal }), resolveChain: resolveToken, baseUrl: publicBase, stateFile: process.env.XBOT_STATE_FILE || path.join(__dirname, 'data', 'xbot-state.json') });
xbot.start();

// ---------- wallet tracker + alerts (web push / Telegram) ----------
const { createWalletTracker } = require('./lib/wallettracker');
const { createAlerts } = require('./lib/alerts');
const tracker = createWalletTracker({ rpc: (m, p) => solRpc(m, p, PRIO.low), // background: user-facing calls go first
  perTick: +process.env.WALLET_POLL_PER_TICK || 8 });
async function pricesFor(mints) {
  const ds = await dexTokens(mints); const out = new Map();
  for (const [m, p] of ds) { const d = fromDex(p); out.set(m, { priceUsd: d.priceUsd, symbol: d.symbol, mcap: d.mcap }); }
  return out;
}
const alerts = createAlerts({ dataDir: path.join(__dirname, 'data'), getPrices: pricesFor, ogPeek: m => og.peek(m), ogResults: () => og.db.results, tracker, baseUrl: publicBase });
alerts.start(); tracker.start();
// ---------- smart money: curated public KOL wallets (data/smart-wallets.js) + each visitor's own tracked wallets ----------
const SMART = process.env.SMART_MONEY === '0' ? [] : require('./data/smart-wallets');
const SMART_BY = new Map(SMART.map(w => [w.addr, w]));
tracker.setSource('smart', SMART, { backfill: true });
const SM_WINDOW = 24 * 3600e3;
function smartFor(mint, mine = new Set()) {
  const ev = tracker.eventsFor(mint).filter(e => Date.now() - e.at < SM_WINDOW);
  const smart = [], own = [];
  for (const e of ev) {
    const k = SMART_BY.get(e.wallet);
    const row = { wallet: e.wallet, side: e.side, at: e.at, sol: e.sol, usd: e.usdStable, sig: e.sig };
    if (k) smart.push({ ...row, label: k.label, x: k.x });
    if (mine.has(e.wallet)) own.push(row);
  }
  if (!smart.length && !own.length) return null;
  const buyers = new Set(smart.filter(e => e.side === 'buy').map(e => e.label));
  const sellers = new Set(smart.filter(e => e.side === 'sell').map(e => e.label));
  return { buyers: [...buyers], sellers: [...sellers], mine: own.length ? { buys: own.filter(e => e.side === 'buy').length, sells: own.filter(e => e.side === 'sell').length, wallets: [...new Set(own.map(e => e.wallet))] } : null, last: Math.max(...ev.map(e => e.at)), events: [...smart, ...own.filter(o => !smart.some(s => s.sig === o.sig))].slice(0, 30) };
}
const walletsParam = q => new Set(String(q || '').split(',').filter(isMint).slice(0, 20));

const chip = s => s && { t: s.total, c: s.coin?.score ?? null, cl: s.coin?.label || null, n: s.narrative.score, nl: s.narrative.label, g: s.grade, r: s.reason };
function peekScore(chain, addr) { return chip(store.get(scoreKey(chain, addr))?.value); }
// background: score list tokens once their safety scan is cached (quick mode = no launch scan)
const scoreQ = []; const scoreQueued = new Set(); let scoreBusy = 0;
function enqueueScore(mints) { for (const m of mints) if (m && !scoreQueued.has(m) && !store.get(scoreKey('solana', m))?.value) { scoreQueued.add(m); scoreQ.push(m); } }
setInterval(() => {
  while (scoreBusy < 2 && scoreQ.length) {
    const i = scoreQ.findIndex(m => peekSafety(m)); if (i < 0) break;
    const [m] = scoreQ.splice(i, 1); scoreBusy++;
    scoreFor('solana', m, { full: false }).catch(() => {}).finally(() => { scoreBusy--; scoreQueued.delete(m); });
  }
}, 400).unref();

// ---------- API ----------
const app = express();
app.use(compression());
app.disable('x-powered-by');
const ok = (res, data, maxAge = 15) => { res.set('Cache-Control', `public, max-age=${maxAge}`); res.json(data); };
const fail = (res, e, code = 502) => res.status(code).json({ error: e.message || String(e) });
const isMint = s => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s || '');

// ---------- multi-chain (non-Solana) lists: GeckoTerminal pools per network, enriched by DexScreener ----------
async function dexTokensOn(chain, addrs) {
  const out = new Map(); const uniq = [...new Set(addrs)].filter(Boolean);
  for (let i = 0; i < uniq.length; i += 30) {
    const chunk = uniq.slice(i, i + 30);
    const pairs = await cached(`dst:${chain}:` + chunk.join(','), 45e3, () => getJSON(`https://api.dexscreener.com/tokens/v1/${chain}/${chunk.map(encodeURIComponent).join(',')}`, { prio: PRIO.low })).catch(() => []);
    const lc = new Set(chunk.map(a => a.toLowerCase()));
    for (const p of pairs || []) {
      if (p.chainId !== chain || !lc.has(String(p.baseToken.address).toLowerCase())) continue;
      const k = p.baseToken.address.toLowerCase(); const cur = out.get(k);
      if (!cur || (p.liquidity?.usd || 0) > (cur.liquidity?.usd || 0)) out.set(k, p);
    }
  }
  return out;
}
async function chainList(kind, chain) {
  return cached(`clist:${kind}:${chain}`, 90e3, async () => {
    if (kind === 'gainers') {
      const [t, n] = await Promise.all([chainList('trending', chain), chainList('new', chain)]);
      const m = new Map(); [...t, ...n].forEach(r => m.set(r.chain + r.mint, r));
      return [...m.values()].filter(r => (r.liquidity || 0) >= 5000 && r.change?.h24 != null).sort((a, b) => b.change.h24 - a.change.h24);
    }
    const ep = kind === 'new' ? 'new_pools' : 'trending_pools';
    const base = chain === 'all' ? `https://api.geckoterminal.com/api/v2/networks/${ep}` : `https://api.geckoterminal.com/api/v2/networks/${chains.byId[chain].gt}/${ep}`;
    const pools = [];
    for (let page = 1; page <= 2; page++) {
      try { const d = await getJSON(`${base}?page=${page}`, { prio: PRIO.normal }); pools.push(...(d.data || [])); } catch { break; }
    }
    const seen = new Set();
    let rows = pools.map(fromGecko).filter(r => { const k = r.chain + r.mint; if (seen.has(k)) return false; seen.add(k); return true; });
    const groups = {}; for (const r of rows) if (chains.byId[r.chain]) (groups[r.chain] = groups[r.chain] || []).push(r.mint);
    const ds = {}; for (const [c, a] of Object.entries(groups)) ds[c] = await dexTokensOn(c, a);
    rows = rows.map(r => { const p = ds[r.chain]?.get(r.mint.toLowerCase()); if (!p) return r; const d = fromDex(p); return { ...d, createdAt: d.createdAt || r.createdAt }; });
    if (kind === 'new') rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return rows;
  });
}
// ---------- real-time new pairs (PumpPortal websocket + fast DEX new-pool polling, pushed over SSE) ----------
const { createLiveFeed } = require('./lib/livefeed');
let SOL_USD = null;
const refreshSol = () => dexTokens(['So11111111111111111111111111111111111111112']).then(m => { const p = m.values().next().value; if (p) SOL_USD = num(p.priceUsd) || SOL_USD; }).catch(() => {});
const LIVE = createLiveFeed({
  WebSocket: (() => { try { return require('ws'); } catch { return null; } })(),
  fetchJSON: async (u, ms) => { const r = await fetch(u, { signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error(r.status); return r.json(); },
  solUsd: () => SOL_USD,
  pollPairs: chain => cached('livepairs:' + chain, 10e3, async () => {
    if (chain === 'solana') return (await enrich(await geckoPools('new_pools', 1))).filter(r => r.pair && r.createdAt).sort((a, b) => b.createdAt - a.createdAt);
    const net = chain === 'all' ? '' : chains.byId[chain]?.gt; if (net === undefined) return [];
    const d = await getJSON(`https://api.geckoterminal.com/api/v2/networks/${net ? net + '/' : ''}new_pools?page=1`, { prio: PRIO.normal });
    return (d.data || []).map(fromGecko).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }),
});
app.get('/api/live/status', (req, res) => ok(res, { ...LIVE.stats, buffered: LIVE.recent(500).length, viewers: LIVE.viewers(), solUsd: SOL_USD }, 2));
app.get('/api/live/new', (req, res) => {
  const chain = String(req.query.chain || 'solana');
  if (chain !== 'solana' && chain !== 'all' && !chains.byId[chain]) return fail(res, new Error('unsupported chain'), 404);
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders?.();
  const send = (ev, data) => { res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`); res.flush?.(); };
  const slim = r => ({ ...r, uri: undefined, sig: undefined, score: r.chain && r.chain !== 'solana' ? null : peekScore('solana', r.mint) });
  send('hello', { chain, pump: chain === 'solana' || chain === 'all' ? LIVE.stats.connected : false, now: Date.now(), recent: chain === 'solana' || chain === 'all' ? LIVE.recent(30).map(slim) : [] });
  const off = LIVE.watch(chain, ev => send(ev.type, { row: slim(ev.row), sent: Date.now() }));
  const hb = setInterval(() => send('ping', { now: Date.now(), pump: LIVE.stats.connected }), 20e3);
  req.on('close', () => { clearInterval(hb); off(); });
});
app.get('/api/chains', (req, res) => ok(res, { chains: chains.SUPPORTED.map(({ id, name, color }) => ({ id, name, color })), skipped: chains.CHAINS.filter(c => !c.gt).map(c => c.name) }, 3600));
app.get('/api/list/:kind', async (req, res) => {
  const chain = String(req.query.chain || 'solana');
  if (chain !== 'solana') {
    if (!['trending', 'new', 'gainers'].includes(req.params.kind)) return fail(res, new Error('list not available on this chain'), 404);
    if (chain !== 'all' && !chains.byId[chain]) return fail(res, new Error('unsupported chain'), 404);
    try { const rows = await chainList(req.params.kind, chain); res.set('Cache-Control', 'no-cache'); return res.json({ updatedAt: store.get(`clist:${req.params.kind}:${chain}`)?.at || Date.now(), rows: rows.map(r => ({ ...r, safety: null, og: null, promo: 0, scope: false, score: peekScore(r.chain || chain, r.mint) })) }); }
    catch (e) { return fail(res, e); }
  }
  const fn = lists[req.params.kind];
  if (!fn) return fail(res, new Error('unknown list'), 404);
  try {
    let rows = await fn();
    const boosts = pay.activeBoosts(), scoped = pay.scopedMints();
    if (req.params.kind === 'trending') {
      // paid boosts raise ranking: promoted tokens are pinned on top (ordered by active boosts) and clearly labelled
      const missing = Object.keys(boosts).filter(m => !rows.some(r => r.mint === m));
      if (missing.length) { const ds = await dexTokens(missing); rows = [...[...ds.values()].map(fromDex), ...rows]; }
      rows = rows.map((r, i) => ({ r, i })).sort((a, b) => (boosts[b.r.mint] || 0) - (boosts[a.r.mint] || 0) || a.i - b.i).map(x => x.r);
    }
    if (req.params.kind === 'new') {
      // fold in launches the live feed saw that the 45s-cached GeckoTerminal list hasn't caught up with yet
      const have = new Set(rows.map(r => r.mint));
      const live = LIVE.recent(80).filter(r => !have.has(r.mint)).map(r => ({ ...r, uri: undefined, sig: undefined }));
      if (live.length) rows = [...live, ...rows].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }
    for (const r of rows) og.sample(r.mint, r.mcap ?? r.fdv);
    enqueue(rows.slice(0, 120).map(r => r.mint)); enqueueOG(rows.slice(0, 120)); enqueueScore(rows.slice(0, 120).map(r => r.mint));
    res.set('Cache-Control', 'no-cache');
    res.json({ updatedAt: store.get('list:' + req.params.kind)?.at || Date.now(), rows: rows.map(r => withIntel(r, boosts, scoped)) });
  } catch (e) { fail(res, e); }
});
app.get('/api/safety', (req, res) => {
  const mints = String(req.query.mints || '').split(',').filter(isMint).slice(0, 200);
  enqueue(mints);
  const out = {}, ogOut = {};
  const scOut = {};
  for (const m of mints) { const s = peekSafety(m); if (s) out[m] = s; const o = og.peek(m); if (o) ogOut[m] = o; const c = peekScore('solana', m); if (c) scOut[m] = c; }
  enqueueScore(mints);
  ok(res, { safety: out, og: ogOut, score: scOut, pending: safetyQ.length, ogPending: ogQ.length }, 5);
});
app.get('/api/search', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 80);
  if (!q) return ok(res, { rows: [] });
  try {
    const d = await cached('search:' + q.toLowerCase(), 60e3, () => getJSON(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`, { prio: PRIO.high }));
    const m = new Map();
    for (const p of d.pairs || []) if (p.chainId === 'solana' && !SKIP.has(p.baseToken.address)) {
      const c = m.get(p.baseToken.address); if (!c || (p.liquidity?.usd || 0) > (c.liquidity?.usd || 0)) m.set(p.baseToken.address, p);
    }
    const rows = [...m.values()].map(fromDex).slice(0, 20);
    enqueue(rows.map(r => r.mint)); enqueueOG(rows);
    ok(res, { rows: rows.map(r => withIntel(r)) }, 30);
  } catch (e) { fail(res, e); }
});
const isAddr = s => /^[A-Za-z0-9:._\-]{3,160}$/.test(s || '');
async function chainToken(chain, addr, res) {
  const c = chains.byId[chain]; if (!c || !isAddr(addr)) return fail(res, new Error('invalid chain or address'), 400);
  try {
    const pairs = await cached(`dsp:${chain}:${addr}`, 30e3, () => getJSON(`https://api.dexscreener.com/tokens/v1/${chain}/${encodeURIComponent(addr)}`, { prio: PRIO.high })).catch(() => []);
    const ps = (pairs || []).filter(p => p.chainId === chain && String(p.baseToken.address).toLowerCase() === addr.toLowerCase()).sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
    let main = ps[0] ? fromDex(ps[0]) : null;
    if (!main) {
      const g = await cached(`gtt:${chain}:${addr}`, 60e3, () => getJSON(`https://api.geckoterminal.com/api/v2/networks/${c.gt}/tokens/${encodeURIComponent(addr)}/pools?page=1`, { prio: PRIO.high })).catch(() => null);
      if (g?.data?.[0]) main = fromGecko(g.data[0]);
    }
    if (!main) return fail(res, new Error('Token not found on this chain'), 404);
    ok(res, { mint: addr, chain, main, pairs: ps.slice(0, 8).map(fromDex), safety: { unavailable: true, error: 'Safety scan is Solana-only for now' }, dev: null, pump: null, og: null, flippedBy: [], scope: null, promo: 0, name: main.name, symbol: main.symbol, icon: main.icon }, 20);
  } catch (e) { fail(res, e); }
}
app.get('/api/score/:chain/:address', async (req, res) => {
  const chain = String(req.params.chain).toLowerCase(), addr = String(req.params.address);
  if (chain === 'solana' ? !isMint(addr) : !chains.byId[chain] || !/^[A-Za-z0-9:_.-]{20,80}$/.test(addr)) return fail(res, new Error('invalid chain or address'), 400);
  try {
    const s = await scoreFor(chain, addr, { full: req.query.quick !== '1', prio: PRIO.high });
    res.set('Access-Control-Allow-Origin', '*');
    ok(res, s, 60);
  } catch (e) { res.set('Access-Control-Allow-Origin', '*'); fail(res, e, e.status); }
});
app.get('/api/token/:mint', async (req, res) => {
  const { mint } = req.params;
  if (req.query.chain && req.query.chain !== 'solana') return chainToken(String(req.query.chain), mint, res);
  if (!isMint(mint)) return fail(res, new Error('invalid mint'), 400);
  try {
    const [pairs, safety, pump] = await Promise.all([
      cached('dsp:' + mint, 30e3, () => getJSON(`https://api.dexscreener.com/tokens/v1/solana/${mint}`, { prio: PRIO.high })).catch(() => []),
      Promise.race([safetyFor(mint, true, PRIO.high), new Promise((_, j) => setTimeout(() => j(new Error('safety scan still running — refresh in a moment')), 12000))]).catch(e => ({ unavailable: true, error: e.message })),
      mint.endsWith('pump') ? cached('pf:' + mint, 60e3, () => getJSON(`https://frontend-api-v3.pump.fun/coins/${mint}`)).catch(() => null) : null,
    ]);
    const sol = (pairs || []).filter(p => p.chainId === 'solana' && p.baseToken.address === mint).sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
    let main = sol[0] ? fromDex(sol[0]) : null;
    if (!main) { // fall back to GeckoTerminal token pools
      try {
        const g = await cached('gtt:' + mint, 60e3, () => getJSON(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mint}/pools?page=1`, { prio: PRIO.high }));
        if (g.data?.[0]) main = fromGecko(g.data[0]);
      } catch {}
    }
    const ident = { mint, name: main?.name || safety?.name || pump?.name, symbol: main?.symbol || safety?.symbol || pump?.symbol };
    let ogInfo = og.peek(mint) || (ident.name ? await Promise.race([og.check(ident).catch(() => null), new Promise(r => setTimeout(() => r(null), 4000))]) : null);
    if (ogInfo && !('vv' in ogInfo)) ogInfo = og.peek(mint) || ogInfo;
    let dev = null;
    const creator = safety?.creator || pump?.creator;
    if (creator) {
      dev = { address: creator, holdingPct: safety?.creatorPct ?? null, otherTokens: safety?.creatorTokens ?? null, solBalance: null };
      try { const b = await cached('bal:' + creator, 120e3, () => rpc('getBalance', [creator])); dev.solBalance = b.value / 1e9; } catch {}
    }
    const pumpInfo = pump ? { complete: !!pump.complete, replies: pump.reply_count ?? null, createdAt: pump.created_timestamp, usdMcap: num(pump.usd_market_cap), description: pump.description || null, image: pump.image_uri || null } : null;
    if (!main && !pump && safety?.unavailable) return fail(res, new Error('Token not found on any data source'), 404);
    ok(res, {
      mint, main, pairs: sol.slice(0, 8).map(fromDex), safety, dev, pump: pumpInfo, og: ogInfo,
      flippedBy: og.flippedBy(mint), scope: pay.scopeInfo(mint), promo: pay.activeBoosts()[mint] || 0,
      name: main?.name || safety?.name || pump?.name, symbol: main?.symbol || safety?.symbol || pump?.symbol,
      icon: main?.icon || pump?.image_uri || null,
    }, 20);
  } catch (e) { fail(res, e); }
});
const TF = { '1m': ['minute', 1], '5m': ['minute', 5], '15m': ['minute', 15], '1h': ['hour', 1], '4h': ['hour', 4], '1d': ['day', 1] };
// OHLCV: serve cached candles instantly (stale-while-revalidate), user requests get top priority,
// and if GeckoTerminal can't answer within a deadline we tell the UI to use its fallback chart.
const ohlcvUrl = (pool, tf, net = 'solana') => `https://api.geckoterminal.com/api/v2/networks/${net}/pools/${pool}/ohlcv/${tf[0]}?aggregate=${tf[1]}&limit=300&currency=usd`;
const toCandles = d => (d.data?.attributes?.ohlcv_list || []).map(([t, o, h, l, c, v]) => ({ time: t, open: o, high: h, low: l, close: c, volume: v })).sort((a, b) => a.time - b.time);
function fetchOhlcv(pool, tfKey, prio, net = 'solana') {
  const key = `ohlcv:${net === 'solana' ? '' : net + ':'}${pool}:${tfKey}`;
  const hit = store.get(key);
  if (prio >= PRIO.high) bump(ohlcvUrl(pool, TF[tfKey], net), prio);
  if (hit?.pending) return hit.pending;
  const pending = getJSON(ohlcvUrl(pool, TF[tfKey], net), { prio, timeout: 12000 }).then(d => {
    const v = toCandles(d); store.set(key, { value: v, at: Date.now() }); return v;
  }).catch(e => { if (hit?.value) store.set(key, { value: hit.value, at: hit.at }); else store.delete(key); throw e; });
  store.set(key, { ...(hit || {}), pending });
  return pending;
}
app.get('/api/ohlcv/:pool', async (req, res) => {
  const tfKey = TF[req.query.tf] ? req.query.tf : '5m'; const { pool } = req.params;
  const net = req.query.chain && req.query.chain !== 'solana' ? chains.byId[req.query.chain]?.gt : 'solana';
  if (!net || !(net === 'solana' ? isMint(pool) : isAddr(pool))) return fail(res, new Error('invalid pool'), 400);
  const key = `ohlcv:${net === 'solana' ? '' : net + ':'}${pool}:${tfKey}`;
  const hit = store.get(key);
  const age = hit?.value ? Date.now() - hit.at : Infinity;
  if (hit?.value && age < 30 * 60e3) {
    if (age > 45e3) fetchOhlcv(pool, tfKey, PRIO.high, net).catch(() => {}); // refresh in background
    res.set('Cache-Control', 'no-cache');
    return res.json({ candles: hit.value, cachedAgeSec: Math.round(age / 1000), source: 'geckoterminal' });
  }
  const deadline = new Promise(r => setTimeout(() => r('timeout'), 7000));
  try {
    const v = await Promise.race([fetchOhlcv(pool, tfKey, PRIO.high, net), deadline]);
    if (v === 'timeout') return res.status(503).json({ error: 'Chart data is busy, using fallback chart', fallback: true, queue: gtQueueDepth() });
    res.set('Cache-Control', 'public, max-age=30'); res.json({ candles: v, cachedAgeSec: 0, source: 'geckoterminal' });
  } catch (e) { res.status(503).json({ error: e.message, fallback: true }); }
});
// warm OHLCV (5m) for the top trending pools at low priority so most chart opens are instant
// sample mcap of vamps and their OGs every 10 min (one DexScreener batch per 30 tokens, low priority)
async function sampleVampMcaps() {
  const mints = new Set();
  for (const [m, r] of Object.entries(og.db.results)) if (r.status === 'vamp' && r.og && Date.now() - r.checkedAt < 48 * 3600e3) { mints.add(m); mints.add(r.og.mint); }
  const list = [...mints].slice(0, 300);
  for (let i = 0; i < list.length; i += 30) {
    const chunk = list.slice(i, i + 30);
    const pairs = await getJSON(`https://api.dexscreener.com/tokens/v1/solana/${chunk.join(',')}`, { prio: PRIO.low }).catch(() => []);
    const best = {};
    for (const p of pairs || []) { const m = p.baseToken?.address; if (!best[m] || (p.liquidity?.usd || 0) > (best[m].liquidity?.usd || 0)) best[m] = p; }
    for (const [m, p] of Object.entries(best)) og.sample(m, p.marketCap ?? p.fdv);
  }
}
async function prefetchOhlcv() {
  try {
    const rows = await lists.trending();
    for (const r of rows.slice(0, 8)) {
      const hit = store.get(`ohlcv:${r.pair}:5m`);
      if (r.pair && !(hit?.value && Date.now() - hit.at < 4 * 60e3)) await fetchOhlcv(r.pair, '5m', PRIO.low).catch(() => {});
    }
  } catch {}
}
app.get('/api/trades/:pool', async (req, res) => {
  const { pool } = req.params;
  const net = req.query.chain && req.query.chain !== 'solana' ? chains.byId[req.query.chain]?.gt : 'solana';
  if (!net || !(net === 'solana' ? isMint(pool) : isAddr(pool))) return fail(res, new Error('invalid pool'), 400);
  try {
    const d = await cached(`trades:${net}:` + pool, 20e3, () => getJSON(`https://api.geckoterminal.com/api/v2/networks/${net}/pools/${pool}/trades`, { prio: PRIO.high - 1, timeout: 10000 }));
    const rows = (d.data || []).slice(0, 60).map(t => {
      const a = t.attributes;
      return { tx: a.tx_hash, wallet: a.tx_from_address, kind: a.kind, at: a.block_timestamp, usd: num(a.volume_in_usd),
        tokenAmount: num(a.kind === 'buy' ? a.to_token_amount : a.from_token_amount), price: num(a.kind === 'buy' ? a.price_to_in_usd : a.price_from_in_usd) };
    });
    // a public KOL wallet showing up in this pool's trade feed counts as a smart-money trade too
    if (net === 'solana' && isMint(req.query.mint)) for (const r of rows) { const k = SMART_BY.get(r.wallet); if (k && (r.kind === 'buy' || r.kind === 'sell')) tracker.record({ wallet: r.wallet, mint: req.query.mint, side: r.kind, amount: r.tokenAmount, sol: null, usdStable: r.usd, sig: r.tx, at: Date.parse(r.at) || Date.now(), labels: [{ label: k.label, source: 'smart' }], live: false }); }
    ok(res, { rows }, 15);
  } catch (e) { fail(res, e); }
});
app.get('/api/prices', async (req, res) => {
  const mints = String(req.query.mints || '').split(',').filter(isMint).slice(0, 60);
  try {
    const ds = await dexTokens(mints); const out = {};
    for (const [m, p] of ds) { const d = fromDex(p); out[m] = { priceUsd: d.priceUsd, change: d.change, symbol: d.symbol, icon: d.icon, mcap: d.mcap, liquidity: d.liquidity, pair: d.pair }; }
    ok(res, { prices: out }, 10);
  } catch (e) { fail(res, e); }
});
app.get('/api/smart', (req, res) => {
  const mine = walletsParam(req.query.w); const tokens = {};
  for (const m of tracker.mints()) { const s = smartFor(m, mine); if (s && (s.buyers.length || s.mine)) { delete s.events; tokens[m] = s; } }
  res.set('Cache-Control', 'no-store'); res.json({ tokens, tracked: SMART.length, windowHours: SM_WINDOW / 3600e3, status: { polls: tracker.status.polls, events: tracker.status.events } });
});
app.get('/api/smart/:mint', (req, res) => {
  if (!isMint(req.params.mint)) return fail(res, new Error('bad mint'), 400);
  res.set('Cache-Control', 'no-store'); res.json({ ...(smartFor(req.params.mint, walletsParam(req.query.w)) || { buyers: [], sellers: [], mine: null, events: [] }), tracked: SMART.length, windowHours: SM_WINDOW / 3600e3, known: SMART });
});
// ---------- alerts ----------
app.get('/api/alerts/config', (req, res) => { res.set('Cache-Control', 'no-store'); res.json({ vapidPublicKey: alerts.vapidPublicKey, telegram: { enabled: alerts.status.telegram.enabled, username: alerts.status.telegram.username }, push: true }); });
app.post('/api/alerts/sync', express.json({ limit: '60kb' }), (req, res) => { try { res.set('Cache-Control', 'no-store'); res.json(alerts.sync(req.body)); } catch (e) { fail(res, e, e.status || 500); } });
app.post('/api/alerts/test', express.json({ limit: '2kb' }), async (req, res) => { try { res.json(await alerts.test(String(req.body?.sid || ''))); } catch (e) { fail(res, e, e.status || 500); } });
app.post('/api/alerts/delete', express.json({ limit: '2kb' }), (req, res) => { alerts.remove(String(req.body?.sid || '')); res.json({ ok: true }); });
// ---------- profile / wallet PnL helpers ----------
// SOL/USD history for valuing past SOL-quoted trades (Raydium SOL/USDC pool on GeckoTerminal, cached 30m).
const SOL_USDC_POOL = '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2';
app.get('/api/solprice', async (req, res) => {
  try {
    const d = await cached('solprice', 30 * 60e3, async () => {
      const series = async (tf, agg, limit) => {
        const j = await getJSON(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${SOL_USDC_POOL}/ohlcv/${tf}?aggregate=${agg}&limit=${limit}&currency=usd`, { prio: PRIO.normal, timeout: 12000 });
        return (j.data?.attributes?.ohlcv_list || []).map(c => [c[0], +c[4]]).sort((a, b) => a[0] - b[0]);
      };
      const [hourly, daily] = await Promise.all([series('hour', 1, 300).catch(() => []), series('day', 1, 365).catch(() => [])]);
      let now = hourly.length ? hourly[hourly.length - 1][1] : null;
      if (!now) { const ds = await dexTokens(['So11111111111111111111111111111111111111112']); const p = ds.values().next().value; now = p ? num(p.priceUsd) : null; }
      if (!now && !daily.length) throw new Error('SOL price unavailable');
      return { now, hourly, daily };
    });
    ok(res, d, 300);
  } catch (e) { fail(res, e); }
});
// Read-only Solana RPC proxy: the browser talks to the public RPC directly first (its own rate limit); this is the
// fallback when that is blocked. Only a few read methods, small batches, throttled per host like everything else.
const RPC_METHODS = new Set(['getSignaturesForAddress', 'getTransaction', 'getBalance', 'getTokenAccountsByOwner']);
app.post('/api/rpc', express.json({ limit: '20kb' }), async (req, res) => {
  const body = req.body; const list = Array.isArray(body) ? body : [body];
  if (!list.length || list.length > 10 || !list.every(c => c && RPC_METHODS.has(c.method) && Array.isArray(c.params))) return fail(res, new Error('unsupported RPC request'), 400);
  try {
    const clean = list.map((c, i) => ({ jsonrpc: '2.0', id: c.id ?? i, method: c.method, params: c.params }));
    const d = await getJSON(RPC, { method: 'POST', body: JSON.stringify(Array.isArray(body) ? clean : clean[0]), timeout: 20000, prio: PRIO.high });
    res.set('Cache-Control', 'no-store'); res.json(d);
  } catch (e) { fail(res, e, /429/.test(e.message) ? 429 : 502); }
});
// ---------- monetization: Scoped + Boosts (Solana Pay) ----------
app.use('/api/orders', express.json({ limit: '20kb' }));
app.use('/api/admin', express.json({ limit: '5kb' }));
app.get('/api/pricing', (req, res) => ok(res, { recipient: pay.RECIPIENT, products: Object.values(pay.PRODUCTS) }, 300));
const httpsUrl = (v, max = 300) => { if (!v) return null; const t = String(v).trim().slice(0, max); try { const u = new URL(t); return u.protocol === 'https:' ? u.toString() : false; } catch { return false; } };
app.post('/api/orders', async (req, res) => {
  try {
    const { product, mint } = req.body || {};
    if (!pay.PRODUCTS[product]) return fail(res, new Error('Unknown product'), 400);
    if (!isMint(mint)) return fail(res, new Error('Invalid token address'), 400);
    const pairs = await cached('dsp:' + mint, 30e3, () => getJSON(`https://api.dexscreener.com/tokens/v1/solana/${mint}`)).catch(() => []);
    if (!(pairs || []).some(p => p.baseToken?.address === mint)) return fail(res, new Error('Token has no Solana trading pair indexed yet'), 400);
    let details = {};
    if (product === 'scope') {
      const b = req.body;
      const f = { logo: httpsUrl(b.logo), banner: httpsUrl(b.banner), website: httpsUrl(b.website), twitter: httpsUrl(b.twitter), telegram: httpsUrl(b.telegram) };
      for (const [k, v] of Object.entries(f)) if (v === false) return fail(res, new Error(`${k} must be an https:// URL`), 400);
      if (!f.logo) return fail(res, new Error('Logo URL is required'), 400);
      const description = String(b.description || '').trim().slice(0, 600);
      if (description.length < 20) return fail(res, new Error('Description must be at least 20 characters'), 400);
      details = { ...f, description, contact: String(b.contact || '').trim().slice(0, 100) };
    } else {
      // we don't sell visibility to tokens our own scanner rates high-risk
      const sf = await safetyFor(mint).catch(() => null);
      if (sf && !sf.unavailable && sf.grade === 'danger') return fail(res, new Error(`Boosts are not available for tokens with a high-risk safety score (${sf.score}/100)`), 400);
    }
    res.json(await pay.createOrder(product, mint, details));
  } catch (e) { fail(res, e); }
});
app.get('/api/orders/:id', async (req, res) => {
  try {
    const o = await pay.checkOrder(String(req.params.id)); if (!o) return fail(res, new Error('Order not found'), 404);
    if (o.status === 'pending') for (const op of o.options) op.qr = await QRCode.toDataURL(op.url, { margin: 1, width: 240 }); res.set('Cache-Control', 'no-store'); res.json(o); }
  catch (e) { fail(res, e); }
});
const ADMIN = process.env.ADMIN_PASSWORD || '';
const adminFails = new Map();
function admin(req, res, next) {
  if (!ADMIN) return fail(res, new Error('Admin disabled: set ADMIN_PASSWORD'), 503);
  const ip = req.ip; const f = adminFails.get(ip) || { n: 0, t: 0 };
  if (f.n >= 10 && Date.now() - f.t < 15 * 60e3) return fail(res, new Error('Too many attempts, try later'), 429);
  const a = Buffer.from(String(req.get('x-admin-password') || '')), b = Buffer.from(ADMIN);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) { adminFails.set(ip, { n: f.n + 1, t: Date.now() }); return fail(res, new Error('Wrong password'), 401); }
  adminFails.delete(ip); next();
}
app.get('/api/admin/orders', admin, (req, res) => { res.set('Cache-Control', 'no-store'); res.json({ orders: pay.allOrders() }); });
app.post('/api/admin/orders/:id/:action(approve|reject)', admin, (req, res) => {
  try { res.json(pay.review(req.params.id, req.params.action === 'approve', req.body?.note)); } catch (e) { fail(res, e, 400); }
});
app.post('/api/admin/orders/:id/recheck', admin, async (req, res) => { try { res.json(await pay.checkOrder(req.params.id)); } catch (e) { fail(res, e); } });

// ---------- buy on site (Jupiter Plugin) ----------
const JUP = require('./lib/jupiter').jupiterConfig(process.env, console);
console.log(`[jupiter] plugin ${JUP.plugin ? 'on' : 'off'}, referral ${JUP.referralAccount ? JUP.feeBps + ' bps' : 'off (set JUP_REFERRAL_ACCOUNT)'}`);
app.get('/api/config', (req, res) => ok(res, { jup: JUP }, 300));
app.get('/api/health', (req, res) => res.json({ ok: true, gtQueue: gtQueueDepth(), queue: safetyQ.length, ogQueue: ogQ.length, ogCached: Object.keys(og.db.results).length, scoreQueue: scoreQ.length, xbot: { enabled: xbot.status.enabled, handle: xbot.status.handle, dryRun: xbot.status.dryRun, lastPoll: xbot.status.lastPoll, lastError: xbot.status.lastError, replies: xbot.status.replies, pausedUntil: xbot.status.pausedUntil }, alerts: { subscribers: alerts.status.subscribers, vapid: alerts.status.vapid, telegram: alerts.status.telegram, sent: alerts.status.sent, lastTick: alerts.status.lastTick }, wallets: tracker.status, cacheEntries: store.size }));

app.use('/vendor/lightweight-charts.js', express.static(path.join(__dirname, 'node_modules/lightweight-charts/dist/lightweight-charts.standalone.production.js'), { maxAge: '7d' }));
app.get('/sw.js', (req, res) => { res.set('Cache-Control', 'no-cache'); res.type('application/javascript').sendFile(path.join(__dirname, 'public', 'sw.js')); });
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '5m' }));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get(/^\/(token\/.*|advertise|profile|order\/.*|c\/.*)?$/, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

if (require.main === module) {
  app.listen(PORT, () => console.log(`On the Scope on http://localhost:${PORT}`));
  refreshSol(); setInterval(refreshSol, 5 * 60e3).unref(); LIVE.start();
  // warm caches so the first visitor sees data and safety scores
  const warm = () => Promise.allSettled(Object.keys(lists).map(k => lists[k]().then(r => { enqueue(r.slice(0, 80).map(x => x.mint)); enqueueOG(r.slice(0, 80)); })));
  warm(); setInterval(warm, 90e3).unref();
  setTimeout(() => { sampleVampMcaps(); setInterval(sampleVampMcaps, 10 * 60e3).unref(); }, 60e3);
  setTimeout(() => { prefetchOhlcv(); setInterval(prefetchOhlcv, 5 * 60e3).unref(); }, 20e3);
}
module.exports = { app };
