// Real-time "New pairs" feed.
//  * pump.fun (and LetsBonk) launches stream in from PumpPortal's free websocket (wss://pumpportal.fun/api/data,
//    method subscribeNewToken, docs: https://pumpportal.fun/data-api/real-time). One connection for the whole
//    server, so it costs nothing per visitor and never touches the free RPC.
//  * Freshly created DEX pools (Raydium, Meteora, PumpSwap, other chains) come from GeckoTerminal new_pools,
//    polled every DEX_POLL_MS (default 15s) only while someone is watching that chain.
//  * Browsers get both through Server-Sent Events (GET /api/live/new) so coins appear the moment we see them.
"use strict";
const EventEmitter = require('events');

const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// PumpPortal create message -> list row (same shape as /api/list rows)
function rowFromPumpPortal(m, solUsd, now = Date.now()) {
  if (!m || m.txType !== 'create' || !B58.test(m.mint || '')) return null;
  const mcapSol = Number(m.marketCapSol) || null;
  const bonk = m.pool === 'bonk';
  return {
    mint: m.mint, symbol: String(m.symbol || '').slice(0, 24) || '???', name: String(m.name || '').slice(0, 64),
    icon: null, uri: typeof m.uri === 'string' ? m.uri : null, createdAt: now, seenAt: now,
    creator: B58.test(m.traderPublicKey || '') ? m.traderPublicKey : null, sig: m.signature || null,
    pair: m.bondingCurveKey || null, dex: bonk ? 'letsbonk curve' : 'pump.fun curve', src: bonk ? 'letsbonk' : 'pump.fun',
    devBuySol: Number(m.solAmount) || 0, mcapSol, mcap: mcapSol && solUsd ? mcapSol * solUsd : null,
    priceUsd: mcapSol && solUsd ? (mcapSol * solUsd) / 1e9 : null, // pump.fun & bonk tokens have a 1B supply
    liquidity: null, volume: {}, change: {}, txns: {}, live: true, websites: [], socials: [],
  };
}

// metadata JSON (ipfs/arweave) -> icon + socials. Kept small and defensive.
function applyMeta(row, meta) {
  if (!meta || typeof meta !== 'object') return row;
  const url = v => (typeof v === 'string' && /^https?:\/\//.test(v) ? v.slice(0, 300) : null);
  row.icon = url(meta.image) || row.icon;
  const tw = url(meta.twitter), tg = url(meta.telegram), web = url(meta.website);
  row.socials = [tw && { type: 'twitter', url: tw }, tg && { type: 'telegram', url: tg }].filter(Boolean);
  row.websites = web ? [{ url: web }] : [];
  return row;
}

function createLiveFeed({ WebSocket, fetchJSON, solUsd = () => null, pollPairs, log = console, env = process.env } = {}) {
  const bus = new EventEmitter(); bus.setMaxListeners(0);
  const KEEP = 200, buf = []; const seen = new Set();
  const stats = { connected: false, since: null, received: 0, lastAt: null, reconnects: 0, metaOk: 0, dexAdded: 0, lastError: null };
  const URL_ = env.PUMPPORTAL_WS || 'wss://pumpportal.fun/api/data';
  let ws = null, backoff = 1000, stopped = false;

  function push(row, kind = 'token') {
    if (seen.has(row.mint)) return false;
    seen.add(row.mint); buf.unshift(row);
    while (buf.length > KEEP) seen.delete(buf.pop().mint);
    bus.emit('event', { type: kind, row });
    return true;
  }
  // metadata fetches: max 3 at a time, newest first, drop the backlog during launch storms
  const metaQ = []; let metaBusy = 0;
  function queueMeta(row) { if (!row.uri || !fetchJSON) return; metaQ.unshift(row); metaQ.length = Math.min(metaQ.length, 30); pump(); }
  function pump() {
    while (metaBusy < 3 && metaQ.length) {
      const row = metaQ.shift(); metaBusy++;
      fetchJSON(row.uri.replace('https://ipfs.io/ipfs/', 'https://gateway.pinata.cloud/ipfs/'), 5000)
        .catch(() => fetchJSON(row.uri, 5000))
        .then(meta => { applyMeta(row, meta); stats.metaOk++; bus.emit('event', { type: 'update', row }); })
        .catch(() => {}).finally(() => { metaBusy--; pump(); });
    }
  }
  function connect() {
    if (stopped || !WebSocket) return;
    try { ws = new WebSocket(URL_); } catch (e) { stats.lastError = e.message; return retry(); }
    ws.on('open', () => { stats.connected = true; stats.since = Date.now(); backoff = 1000; ws.send(JSON.stringify({ method: 'subscribeNewToken' })); log.log?.('[live] PumpPortal connected'); });
    ws.on('message', data => {
      let m; try { m = JSON.parse(String(data)); } catch { return; }
      const row = rowFromPumpPortal(m, solUsd());
      if (!row) return;
      stats.received++; stats.lastAt = row.seenAt;
      if (push(row)) queueMeta(row);
    });
    const down = e => { if (stats.connected || e) { stats.connected = false; if (e) stats.lastError = String(e.message || e); } };
    ws.on('error', e => down(e));
    ws.on('close', () => { down(); retry(); });
  }
  function retry() { if (stopped) return; stats.reconnects++; setTimeout(connect, backoff).unref?.(); backoff = Math.min(backoff * 2, 60e3); }

  // DEX pools: poll only while someone listens on that chain
  const watchers = new Map(); const dexSeen = new Map(); const timers = new Map();
  const POLL = Math.max(8000, +env.DEX_POLL_MS || 15000);
  async function pollChain(chain) {
    try {
      const rows = (await pollPairs(chain)) || [];
      const s = dexSeen.get(chain) || new Set(); const first = !dexSeen.has(chain); dexSeen.set(chain, s);
      for (const r of rows.slice(0, 40)) {
        const k = r.chain === undefined || r.chain === 'solana' ? r.mint : r.chain + ':' + r.mint;
        if (s.has(k)) continue; s.add(k);
        if (!first) { stats.dexAdded++; bus.emit('event', { type: 'token', chain, row: { ...r, seenAt: Date.now(), live: true } }); }
      }
      if (s.size > 2000) dexSeen.set(chain, new Set([...s].slice(-500)));
    } catch (e) { stats.lastError = 'dex ' + chain + ': ' + e.message; }
  }
  function watch(chain, fn) {
    const h = ev => { if (ev.chain ? ev.chain === chain || chain === 'all' : chain === 'solana' || chain === 'all') fn(ev); };
    bus.on('event', h);
    watchers.set(chain, (watchers.get(chain) || 0) + 1);
    if (pollPairs && !timers.has(chain)) { pollChain(chain); const t = setInterval(() => pollChain(chain), POLL); t.unref?.(); timers.set(chain, t); }
    return () => {
      bus.off('event', h); const n = (watchers.get(chain) || 1) - 1; watchers.set(chain, n);
      if (!n && timers.has(chain)) { clearInterval(timers.get(chain)); timers.delete(chain); }
    };
  }
  return {
    start() { if (env.LIVE_FEED === '0') { log.log?.('[live] LIVE_FEED=0, real-time feed off'); return; } connect(); },
    stop() { stopped = true; try { ws?.close(); } catch {} for (const t of timers.values()) clearInterval(t); },
    recent: (n = 60) => buf.slice(0, n), watch, push, stats, _pollNow: pollChain, viewers: () => [...watchers.values()].reduce((a, b) => a + b, 0),
  };
}
module.exports = { createLiveFeed, rowFromPumpPortal, applyMeta };
