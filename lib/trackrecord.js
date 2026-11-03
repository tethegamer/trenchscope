'use strict';
// Public Scope Score track record: log every Solana token's Scope Score the first time we see it scored, then
// check what happened 24h and 7d later (price + liquidity from DexScreener). Published at /api/track-record so
// anyone can see whether high scores actually rug less than low ones. No competitor proves its safety label.
const fs = require('fs');
const path = require('path');
const BUCKETS = [['high', 70, 101], ['mid', 45, 70], ['low', 0, 45]];
const H24 = 24 * 3600e3, D7 = 7 * 24 * 3600e3;
const MAX = 6000;

function createTrackRecord({ file, fetchPrices, log = console, now = () => Date.now() }) {
  let db = { since: now(), items: {} };
  try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); if (j && j.items) db = j; } catch {}
  let saveT; const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(db)); } catch (e) { log.warn?.('[track] save', e.message); } }, 3000); saveT.unref?.(); };

  /** first sight only: { mint, t (Scope Score), price, liq } */
  function record(r) {
    if (!r || !r.mint || db.items[r.mint] || r.t == null || !(r.price > 0)) return false;
    db.items[r.mint] = { t: r.t, p0: r.price, l0: r.liq || 0, at: now() };
    const keys = Object.keys(db.items);
    if (keys.length > MAX) { keys.sort((a, b) => db.items[a].at - db.items[b].at).slice(0, keys.length - MAX).forEach(k => delete db.items[k]); }
    save(); return true;
  }
  const outcome = (it, p, l) => ({ p, l, ch: p && it.p0 ? p / it.p0 - 1 : -1, rug: !p || p / it.p0 <= 0.1 || (it.l0 > 0 && (l || 0) < it.l0 * 0.1) });
  /** check up to `limit` due tokens (24h / 7d) in one DexScreener batch */
  async function check(limit = 30) {
    const t = now(); const due = [];
    for (const [m, it] of Object.entries(db.items)) {
      if (!it.d1 && t - it.at >= H24) due.push([m, 'd1']);
      else if (it.d1 && !it.d7 && t - it.at >= D7) due.push([m, 'd7']);
      if (due.length >= limit) break;
    }
    if (!due.length) return 0;
    const px = await fetchPrices(due.map(d => d[0]));
    for (const [m, k] of due) { const q = px.get(m); db.items[m][k] = outcome(db.items[m], q?.price || 0, q?.liq || 0); }
    save(); return due.length;
  }
  function stats() {
    const out = { since: db.since, tracked: Object.keys(db.items).length, buckets: {} };
    for (const [name, lo, hi] of BUCKETS) {
      const its = Object.values(db.items).filter(i => i.t >= lo && i.t < hi);
      const agg = k => { const xs = its.filter(i => i[k]); if (!xs.length) return { n: 0 }; const ch = xs.map(i => i[k].ch).sort((a, b) => a - b);
        return { n: xs.length, rugPct: Math.round(xs.filter(i => i[k].rug).length / xs.length * 1000) / 10, medianChangePct: Math.round(ch[ch.length >> 1] * 1000) / 10 }; };
      out.buckets[name] = { range: `${lo}-${Math.min(hi, 100) - (hi > 100 ? 0 : 1)}`, logged: its.length, h24: agg('d1'), d7: agg('d7') };
    }
    out.note = '"Rug" = price down 90%+ or liquidity down 90%+ vs first sighting. Scores logged at first sight, never edited.';
    return out;
  }
  return { record, check, stats, _db: () => db };
}
module.exports = { createTrackRecord };
