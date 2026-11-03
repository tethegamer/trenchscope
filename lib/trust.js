'use strict';
// "Trending you can trust": the default 🔥 Trending order. Rows are ranked by organic on-chain activity
// (trades, volume, buy/sell balance, with wash-trading dampers) blended with the Scope Score.
// Paid placement never buys organic rank: our own boosts get a capped, clearly labelled "AD" slot at the top
// only while the token still passes the Scope Score bar; DexScreener-paid entries get no ranking help at all.
const DEFAULTS = { scoreWeight: 0.45, promoSlots: 3, minScore: 50, unknownScore: 35 };
const lg = v => Math.log10(1 + Math.max(0, +v || 0));
const tx = (r, k) => { const t = r.txns?.[k]; return t ? { b: +t.buys || 0, s: +t.sells || 0 } : { b: 0, s: 0 }; };

/** Raw organic activity (unitless, higher = more real trading). */
function activity(r) {
  const h1 = tx(r, 'h1'), h24 = tx(r, 'h24');
  const n1 = h1.b + h1.s, n24 = h24.b + h24.s;
  const v1 = r.volume?.h1 || 0, v24 = r.volume?.h24 || 0, liq = r.liquidity || 0;
  let a = 0.35 * lg(n1) + 0.25 * lg(n24) + 0.25 * lg(v1) + 0.15 * lg(v24);
  if (!a) return 0;
  if (liq < 1000) a *= 0.5; // no real pool behind it
  if (liq && v24 / liq > 60) a *= 0.7; // turnover this extreme is almost always wash trading
  if (n24 && n24 < 300 && v24 / n24 > 5000) a *= 0.7; // a handful of huge trades, not a crowd
  if (n24 >= 50) { const br = h24.b / n24; if (br < 0.2 || br > 0.95) a *= 0.85; } // one-sided flow = bots / exit
  return a;
}
/** Scope Score 0-100 for ranking: the score chip, else the safety score (discounted), else a below-middle default. */
function scoreOf(r, opt = DEFAULTS) {
  if (r.score && r.score.t != null) return r.score.t;
  if (r.safety && !r.safety.unavailable && r.safety.score != null) return r.safety.score * 0.8;
  return opt.unknownScore;
}
/**
 * Rank rows for Trending. Each row may carry: txns, volume, liquidity, score (chip {t}), safety {grade, score}, promo (our active boosts), boosts (DexScreener), dsOnly.
 * Returns new row objects with `trust` (0-100) and `pinned` (true for the labelled AD slots).
 */
function trustRank(rows, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const act = rows.map(activity);
  const sorted = [...act].sort((a, b) => a - b);
  const pctile = a => { if (rows.length < 2) return a ? 100 : 0; let lo = 0, hi = sorted.length; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < a) lo = m + 1; else hi = m; } return (lo / (sorted.length - 1)) * 100; };
  const out = rows.map((r, i) => {
    const sc = scoreOf(r, o);
    let t = (1 - o.scoreWeight) * pctile(act[i]) + o.scoreWeight * sc;
    if (r.safety && !r.safety.unavailable && r.safety.grade === 'danger') t *= 0.4;
    if (r.score && r.score.t != null && r.score.t < 30) t *= 0.6;
    if (r.dsOnly) t *= 0.75; // only here because it paid DexScreener: has to earn its place on activity
    if (!act[i]) t *= 0.3;
    return { ...r, trust: Math.round(t * 10) / 10, pinned: false, _i: i };
  });
  out.sort((a, b) => b.trust - a.trust || a._i - b._i);
  // capped, labelled ad slots: only boosts on tokens that still pass the Scope Score bar
  const eligible = out.filter(r => r.promo > 0 && r.score && r.score.t != null && r.score.t >= o.minScore)
    .sort((a, b) => b.promo - a.promo || b.trust - a.trust).slice(0, o.promoSlots);
  const pin = new Set(eligible.map(r => r.mint));
  const ranked = [...eligible.map(r => ({ ...r, pinned: true })), ...out.filter(r => !pin.has(r.mint))];
  return ranked.map(({ _i, ...r }) => r);
}
const boostMinScore = (env = process.env) => { const raw = env.BOOST_MIN_SCORE; const v = Math.round(+raw); return raw === undefined || raw === '' || !Number.isFinite(v) ? DEFAULTS.minScore : Math.max(0, Math.min(100, v)); };
module.exports = { trustRank, activity, scoreOf, boostMinScore, DEFAULTS };
