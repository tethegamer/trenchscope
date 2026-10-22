// Polls Solana wallets over RPC and turns new transactions into buy/sell events.
// Used by alerts (users' tracked wallets) and smart-money tags (curated KOL wallets).
'use strict';
const QUOTE = new Set([
  'So11111111111111111111111111111111111111112', // wSOL
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
]);
const LAMPORTS = 1e9;

/** Turn one jsonParsed transaction into trades for `wallet` (token in vs SOL/USDC/USDT out = buy). */
function parseTrades(tx, wallet) {
  if (!tx || tx.meta?.err) return [];
  const keys = (tx.transaction?.message?.accountKeys || []).map(k => typeof k === 'string' ? k : k.pubkey);
  const wi = keys.indexOf(wallet);
  const solDelta = wi >= 0 ? ((tx.meta.postBalances[wi] - tx.meta.preBalances[wi]) + (wi === 0 ? tx.meta.fee : 0)) / LAMPORTS : 0;
  const d = new Map();
  const add = (b, sign) => { if (b.owner !== wallet) return; const v = +(b.uiTokenAmount?.uiAmountString ?? b.uiTokenAmount?.uiAmount ?? 0); d.set(b.mint, (d.get(b.mint) || 0) + sign * v); };
  for (const b of tx.meta.preTokenBalances || []) add(b, -1);
  for (const b of tx.meta.postTokenBalances || []) add(b, 1);
  let quoteSpent = -solDelta - (d.get(QUOTE.values().next().value) || 0); // SOL + wSOL out
  const stable = (d.get('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') || 0) + (d.get('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB') || 0);
  const out = [];
  for (const [mint, amt] of d) {
    if (QUOTE.has(mint) || Math.abs(amt) < 1e-9) continue;
    const side = amt > 0 ? 'buy' : 'sell';
    // a buy must pay with SOL/stables, a sell must receive them (filters out plain transfers/airdrops)
    if (side === 'buy' && !(quoteSpent > 0.0005 || stable < -0.01)) continue;
    if (side === 'sell' && !(quoteSpent < -0.0005 || stable > 0.01)) continue;
    out.push({ wallet, mint, side, amount: Math.abs(amt), sol: Math.abs(quoteSpent) > 0.0005 ? Math.abs(quoteSpent) : null, usdStable: Math.abs(stable) > 0.01 ? Math.abs(stable) : null, sig: tx.transaction?.signatures?.[0], at: (tx.blockTime || Date.now() / 1000) * 1000 });
  }
  return out;
}

function createWalletTracker({ rpc, log = console, perTick = 8, tickMs = 20000, keepMs = 3 * 86400e3 }) {
  const sources = new Map(); // name -> Map(addr -> {label, backfill})
  const st = new Map(); // addr -> {last, primed}
  const byMint = new Map(); // mint -> [events]
  const listeners = [];
  let order = [], idx = 0, timer = null, busy = false;
  const status = { wallets: 0, polls: 0, events: 0, lastError: null };
  function setSource(name, list, { backfill = false } = {}) {
    sources.set(name, new Map(list.map(w => [w.addr, { label: w.label, backfill, source: name }])));
    const all = new Set(); for (const m of sources.values()) for (const a of m.keys()) all.add(a);
    order = [...all]; status.wallets = order.length;
  }
  const info = addr => { const r = []; for (const m of sources.values()) if (m.has(addr)) r.push(m.get(addr)); return r; };
  function record(e) {
    const a = byMint.get(e.mint) || []; if (a.some(x => x.sig === e.sig && x.wallet === e.wallet)) return false;
    a.unshift(e); a.length = Math.min(a.length, 50); byMint.set(e.mint, a); status.events++; return true;
  }
  async function pollOne(addr) {
    const s = st.get(addr) || {}; const meta = info(addr); if (!meta.length) return;
    const backfill = meta.some(m => m.backfill);
    // busy KOL wallets: most signatures are failed bot txs or dust spam, so look back further and skip errors
    const sigs = await rpc('getSignaturesForAddress', [addr, { limit: s.last || backfill ? 100 : 1, ...(s.last ? { until: s.last } : {}) }]);
    if (!Array.isArray(sigs)) return;
    if (sigs.length) s.last = sigs[0].signature;
    const fresh = s.primed || backfill ? sigs.filter(x => !x.err).slice(0, 20) : [];
    s.primed = true; st.set(addr, s);
    const todo = fresh.reverse().filter(x => !(x.blockTime && Date.now() - x.blockTime * 1000 > keepMs));
    const txs = [];
    for (let i = 0; i < todo.length; i += 5) // small parallel batches: fast enough, gentle on public RPCs
      txs.push(...await Promise.all(todo.slice(i, i + 5).map(x => rpc('getTransaction', [x.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]).catch(() => null))));
    for (const tx of txs) {
      for (const e of parseTrades(tx, addr)) {
        e.labels = meta.map(m => ({ label: m.label, source: m.source }));
        e.live = !!s.primedAt && e.at >= s.primedAt - 60e3;
        if (record(e)) for (const f of listeners) try { f(e); } catch (err) { log.warn('[wallets] listener', err.message); }
      }
    }
    if (!s.primedAt) s.primedAt = Date.now();
  }
  async function tick() {
    if (busy || !order.length) return; busy = true;
    try {
      for (let n = 0; n < Math.min(perTick, order.length); n++) {
        const a = order[idx++ % order.length];
        await pollOne(a).then(() => status.polls++, e => { status.lastError = e.message; });
      }
      const cut = Date.now() - keepMs;
      for (const [m, a] of byMint) { const k = a.filter(e => e.at >= cut); if (k.length) byMint.set(m, k); else byMint.delete(m); }
    } finally { busy = false; }
  }
  return {
    status, setSource, parseTrades, tick, record,
    _emit(e) { if (record(e)) for (const f of listeners) f(e); },
    onTrade: f => listeners.push(f),
    eventsFor: mint => byMint.get(mint) || [],
    mints: () => byMint.keys(),
    start() { if (!timer) { timer = setInterval(tick, tickMs); timer.unref?.(); setTimeout(tick, 3000).unref?.(); } },
  };
}
module.exports = { createWalletTracker, parseTrades, QUOTE };
