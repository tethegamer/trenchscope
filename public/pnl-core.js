// TrenchScope wallet PnL core — pure functions, shared by the browser (window.PnlCore) and node tests.
// Estimates only: built from the wallet's recent parsed transactions + current/historical prices.
(function (root) {
  const SOL = 'So11111111111111111111111111111111111111112';
  const STABLES = { EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 'USDC', Es9vMFrzaCERmJrfKbg1RKUuu1xDWDH7q8zWZXbFmVCx: 'USDT' };
  const DAY = 86400e3;

  // Reduce a jsonParsed getTransaction result to the wallet's balance deltas (price-independent, compact for caching).
  // -> { s: signature, t: ms, sol: SOL+WSOL delta, usd: stablecoin delta, tk: { mint: uiDelta } } or { s, t, x: 1 } when irrelevant/failed.
  function parseTx(tx, wallet, sig) {
    const s = sig || tx?.transaction?.signatures?.[0];
    const t = (tx?.blockTime || 0) * 1000;
    if (!tx || !tx.meta || tx.meta.err) return { s, t, x: 1 };
    const keys = (tx.transaction?.message?.accountKeys || []).map(k => typeof k === 'string' ? k : k.pubkey);
    const loaded = tx.meta.loadedAddresses ? [...(tx.meta.loadedAddresses.writable || []), ...(tx.meta.loadedAddresses.readonly || [])] : [];
    const all = keys.length >= (tx.meta.preBalances || []).length ? keys : keys.concat(loaded);
    const i = all.indexOf(wallet);
    let sol = i >= 0 ? ((tx.meta.postBalances[i] || 0) - (tx.meta.preBalances[i] || 0)) / 1e9 : 0;
    let usd = 0; const tk = {};
    const add = (b, sign) => {
      if (!b || b.owner !== wallet) return;
      const amt = parseFloat(b.uiTokenAmount?.uiAmountString ?? b.uiTokenAmount?.uiAmount ?? 0) || 0;
      if (b.mint === SOL) sol += sign * amt; else if (STABLES[b.mint]) usd += sign * amt; else tk[b.mint] = (tk[b.mint] || 0) + sign * amt;
    };
    (tx.meta.preTokenBalances || []).forEach(b => add(b, -1));
    (tx.meta.postTokenBalances || []).forEach(b => add(b, 1));
    for (const m of Object.keys(tk)) if (Math.abs(tk[m]) < 1e-9) delete tk[m];
    if (!Object.keys(tk).length) return { s, t, x: 1 }; // pure SOL/stable movement: not a token trade
    return { s, t, sol: +sol.toFixed(9), usd: +usd.toFixed(6), tk };
  }

  // Classify a parsed delta into a trade event using SOL price at that time.
  function classify(r, solUsdAt) {
    if (!r || r.x) return null;
    const px = solUsdAt(r.t) || 0;
    const stableUsed = Math.abs(r.usd || 0) >= 0.01;
    // when a stablecoin is the quote, small SOL moves are just fees/rent
    const q = stableUsed ? r.usd + (Math.abs(r.sol) > 0.02 ? r.sol * px : 0) : r.sol * px;
    let toks = Object.entries(r.tk);
    if (toks.length > 1) toks = toks.filter(([, d]) => Math.abs(d) >= 1e-5); // drop dust spam riding along
    if (toks.length > 1 && Math.abs(q) >= 0.05) { // several tokens + a quote leg: keep the single token moving opposite to the quote
      const opp = toks.filter(([, d]) => Math.sign(d) === -Math.sign(q));
      if (opp.length === 1) toks = opp;
    }
    if (toks.length === 1) {
      const [mint, d] = toks[0];
      const tiny = Math.abs(q) < 0.05;
      if (d > 0 && q < 0 && !tiny) return { s: r.s, t: r.t, kind: 'buy', mint, qty: d, usd: -q };
      if (d < 0 && q > 0 && !tiny) return { s: r.s, t: r.t, kind: 'sell', mint, qty: -d, usd: q };
      if (tiny) return { s: r.s, t: r.t, kind: d > 0 ? 'in' : 'out', mint, qty: Math.abs(d), usd: 0 };
      return null;
    }
    const ins = toks.filter(([, d]) => d > 0), outs = toks.filter(([, d]) => d < 0);
    if (ins.length === 1 && outs.length === 1 && Math.abs(q) < 0.05) return { s: r.s, t: r.t, kind: 'swap', mint: ins[0][0], qty: ins[0][1], from: outs[0][0], fromQty: -outs[0][1], usd: 0 };
    return null;
  }

  // Average-cost PnL per token. prices: mint -> priceUsd, balances: mint -> current ui balance (optional).
  function computePnl(events, { prices = {}, balances = null, now = Date.now() } = {}) {
    const evs = events.filter(Boolean).slice().sort((a, b) => a.t - b.t);
    const tokens = {}; const daily = {}; const curve = [];
    const T = m => tokens[m] || (tokens[m] = { mint: m, boughtQty: 0, boughtUsd: 0, soldQty: 0, soldUsd: 0, pos: 0, cost: 0, realized: 0, unmatchedUsd: 0, buys: 0, sells: 0, first: 0, last: 0 });
    const periods = { d1: { realized: 0, volume: 0, trades: 0 }, d7: { realized: 0, volume: 0, trades: 0 }, d30: { realized: 0, volume: 0, trades: 0 }, all: { realized: 0, volume: 0, trades: 0 } };
    const inP = t => ({ d1: now - t <= DAY, d7: now - t <= 7 * DAY, d30: now - t <= 30 * DAY, all: true });
    let unmatchedSells = 0, transfers = 0, swaps = 0;
    for (const e of evs) {
      if (e.kind === 'swap') { swaps++; continue; }
      const k = T(e.mint); k.first = k.first || e.t; k.last = e.t;
      const p = inP(e.t);
      if (e.kind === 'buy') {
        k.boughtQty += e.qty; k.boughtUsd += e.usd; k.pos += e.qty; k.cost += e.usd; k.buys++;
        for (const n in periods) if (p[n]) { periods[n].volume += e.usd; periods[n].trades++; }
      } else if (e.kind === 'sell') {
        k.soldQty += e.qty; k.soldUsd += e.usd; k.sells++;
        const matched = Math.min(e.qty, k.pos);
        const avg = k.pos > 0 ? k.cost / k.pos : 0;
        const proceeds = e.qty > 0 ? e.usd * (matched / e.qty) : 0;
        const pnl = proceeds - avg * matched;
        if (matched < e.qty * 0.999) { unmatchedSells++; k.unmatchedUsd += e.usd - proceeds; }
        k.realized += pnl; k.pos -= matched; k.cost -= avg * matched;
        if (k.pos < 1e-12) { k.pos = 0; k.cost = 0; }
        const day = new Date(e.t).toISOString().slice(0, 10); daily[day] = (daily[day] || 0) + pnl;
        curve.push({ t: e.t, pnl });
        for (const n in periods) if (p[n]) { periods[n].realized += pnl; periods[n].volume += e.usd; periods[n].trades++; }
      } else if (e.kind === 'out') { // tokens sent away: drop them from the position at cost, no PnL
        transfers++; const q = Math.min(e.qty, k.pos); const avg = k.pos > 0 ? k.cost / k.pos : 0; k.pos -= q; k.cost -= avg * q;
      } else if (e.kind === 'in') transfers++; // received for free: no cost basis known, excluded
    }
    let realized = 0, unrealized = 0, openCost = 0, openValue = 0, wins = 0, closed = 0, costAll = 0;
    const list = Object.values(tokens).map(k => {
      const price = prices[k.mint];
      const held = balances ? (balances[k.mint] || 0) : k.pos;
      const open = Math.min(held, k.pos);
      const avg = k.pos > 0 ? k.cost / k.pos : 0;
      const unreal = open > 0 ? (price != null ? open * price - avg * open : null) : 0;
      const value = price != null ? held * price : null;
      realized += k.realized; if (unreal) unrealized += unreal;
      if (open > 0) { openCost += avg * open; if (price != null) openValue += open * price; }
      if (k.sells) { closed++; if (k.realized > 0) wins++; }
      costAll += k.boughtUsd;
      return { ...k, held, open, avg, price: price ?? null, unrealized: unreal, value, total: k.realized + (unreal || 0) };
    }).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
    const days = [];
    for (let i = 29; i >= 0; i--) { const d = new Date(now - i * DAY).toISOString().slice(0, 10); days.push({ day: d, pnl: daily[d] || 0 }); }
    const total = realized + unrealized;
    return {
      realized, unrealized, total, volume: periods.all.volume, invested: costAll, openCost, openValue,
      roi: costAll > 0 ? total / costAll : null, winRate: closed ? wins / closed : null, closed, wins,
      trades: periods.all.trades, periods, days, curve, tokens: list, unmatchedSells, transfers, swaps,
      from: evs.length ? evs[0].t : null, to: evs.length ? evs[evs.length - 1].t : null,
    };
  }

  // Price lookup from [ [tsSec, close], ... ] series (hourly first, then daily), falling back to `now`.
  function solPriceFn({ hourly = [], daily = [], now = null } = {}) {
    const find = (arr, ts, span) => {
      if (!arr.length || ts < arr[0][0] * 1000 - span || ts > arr[arr.length - 1][0] * 1000 + span) return null;
      let lo = 0, hi = arr.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (arr[mid][0] * 1000 <= ts) lo = mid; else hi = mid - 1; }
      return arr[lo][1];
    };
    return t => find(hourly, t, 3600e3) ?? find(daily, t, DAY) ?? now;
  }

  const api = { SOL, STABLES, parseTx, classify, computePnl, solPriceFn };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PnlCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
