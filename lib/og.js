// OG / VAMP detection.
// "OG" = among Solana tokens sharing the same normalized name (or same ticker + overlapping name), the one whose
// FIRST graduated pair (Raydium or PumpSwap — where pump.fun coins migrate when the bonding curve completes)
// was created earliest. Everyone later with the same identity is a "VAMP" of it.
// Data limits: we only see what DexScreener's search indexes (≈30 pairs per query) — results are "best effort".
const fs = require('fs');
const path = require('path');

const GRAD_DEXES = new Set(['raydium', 'pumpswap']);
const SUFFIXES = ['official', 'token', 'coin', 'onsol', 'sol', 'fun', 'ai'].sort((a, b) => b.length - a.length);
const PREFIXES = ['the', 'official'];

function normalize(s) {
  let t = String(s || '').normalize('NFKD').toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')            // accents
    .replace(/\p{Extended_Pictographic}/gu, '') // emojis
    .replace(/\$/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
  let words = t.split(' ').filter(Boolean);
  while (words.length > 1 && PREFIXES.includes(words[0])) words.shift();
  let j = words.join('');
  // strip one common suffix ("streamoors.fun" -> "streamoors", "bonk coin" -> "bonk"), never to empty / too short
  for (const suf of SUFFIXES) if (j.endsWith(suf) && j.length - suf.length >= 3) { j = j.slice(0, -suf.length); break; }
  return j;
}
function sameIdentity(a, b) {
  const na = normalize(a.name), nb = normalize(b.name), ta = normalize(a.symbol), tb = normalize(b.symbol);
  if (na && na === nb) return true;
  if (ta && ta === tb && na && nb && na.length >= 3 && nb.length >= 3 && (na.includes(nb) || nb.includes(na))) return true;
  return false;
}

function createOG({ getJSON, cached, file }) {
  const db = { results: {}, mcap: {} };
  try { Object.assign(db, JSON.parse(fs.readFileSync(file, 'utf8'))); } catch {}
  db.mcap = db.mcap || {};
  let saveT;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(db)); } catch (e) { console.error('og save', e.message); } }, 2000); };
  const TTL = 6 * 3600e3;
  const VV = { ratio: 3, windowMs: 4 * 3600e3, minSamples: 3, minSpanMs: 3600e3, minAgeMs: 24 * 3600e3 };
  const peek = mint => {
    const r = db.results[mint]; if (!r || Date.now() - r.checkedAt >= TTL) return null;
    if (r.status === 'copycat') r.status = 'vamp'; // legacy cache records
    if (r.status !== 'none' && !r.gradAt) r.status = 'none'; // only migrated tokens are tagged
    return r;
  };

  async function search(q) {
    if (!q || q.length < 2) return [];
    const d = await cached('ogs:' + q.toLowerCase(), 10 * 60e3, () => getJSON(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`));
    return (d.pairs || []).filter(p => p.chainId === 'solana');
  }
  async function allPairs(mints) {
    const out = new Map(mints.map(m => [m, []]));
    for (let i = 0; i < mints.length; i += 30) {
      const chunk = mints.slice(i, i + 30);
      const pairs = await cached('ogt:' + chunk.join(','), 10 * 60e3, () => getJSON(`https://api.dexscreener.com/tokens/v1/solana/${chunk.join(',')}`)).catch(() => []);
      for (const p of pairs || []) if (out.has(p.baseToken?.address)) out.get(p.baseToken.address).push(p);
    }
    return out;
  }

  async function check(token) { // token: {mint, name, symbol}
    const hit = peek(token.mint); if (hit) return hit;
    const [byName, byTicker] = await Promise.all([search(token.name), token.symbol !== token.name ? search(token.symbol) : []]);
    const ident = new Map([[token.mint, { mint: token.mint, name: token.name, symbol: token.symbol }]]);
    for (const p of [...byName, ...byTicker]) {
      const b = { mint: p.baseToken.address, name: p.baseToken.name, symbol: p.baseToken.symbol };
      if (!ident.has(b.mint) && sameIdentity(token, b)) ident.set(b.mint, b);
    }
    const mints = [...ident.keys()].slice(0, 60);
    const pairs = await allPairs(mints);
    const members = mints.map(m => {
      const ps = pairs.get(m) || [];
      const grad = ps.filter(p => GRAD_DEXES.has(p.dexId) && p.pairCreatedAt).sort((a, b) => a.pairCreatedAt - b.pairCreatedAt)[0];
      const firstSeen = ps.map(p => p.pairCreatedAt).filter(Boolean).sort((a, b) => a - b)[0] || null;
      const liq = ps.reduce((s, p) => s + (p.liquidity?.usd || 0), 0);
      const best = ps.slice().sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
      if (best) sample(m, best.marketCap ?? best.fdv);
      return { ...ident.get(m), gradAt: grad?.pairCreatedAt || null, gradDex: grad?.dexId || null, firstSeen, liquidity: liq, indexed: ps.length > 0 };
    });
    const graduated = members.filter(m => m.gradAt).sort((a, b) => a.gradAt - b.gradAt);
    const og = graduated[0] || null;
    const now = Date.now();
    const predating = og ? members.filter(m => m.mint !== og.mint && !m.gradAt && m.firstSeen && m.firstSeen < og.gradAt) : [];
    const group = { size: members.length, graduatedCount: graduated.length, olderNonGraduated: predating.length };
    for (const m of members) {
      if (!m.indexed && m.mint !== token.mint) continue;
      let status;
      if (!og) status = 'none';
      else if (!m.gradAt) status = 'none'; // still on the bonding curve / never migrated: no tag
      else if (m.mint === og.mint) status = 'og';
      // a token that never graduated but was trading BEFORE the OG graduated (e.g. launched directly on Meteora/Orca)
      // is a different origin, not a vamp
      else if (!m.gradAt && m.firstSeen && m.firstSeen < og.gradAt) status = 'none';
      else status = 'vamp';
      const rec = {
        status, checkedAt: now, symbol: m.symbol, gradAt: m.gradAt, gradDex: m.gradDex, firstSeen: m.firstSeen,
        og: og ? { mint: og.mint, symbol: og.symbol, name: og.name, gradAt: og.gradAt, gradDex: og.gradDex } : null,
        vamps: status === 'og' ? members.filter(x => x.mint !== og.mint && !predating.includes(x)).length : undefined, ...group,
      };
      // never downgrade a fresher record for another member computed from a bigger search
      const prev = db.results[m.mint];
      if (m.mint === token.mint || !prev || now - prev.checkedAt > TTL || (prev.size || 0) <= group.size) db.results[m.mint] = rec;
    }
    save();
    return db.results[token.mint];
  }
  // ---- Valid Vamp (VV): smoothed mcap >= 3x the OG's and vamp >= 24h old. Dynamic. ----
  function sample(mint, mcap, now = Date.now()) {
    if (!(mcap > 0)) return;
    const a = db.mcap[mint] || (db.mcap[mint] = []);
    if (a.length && now - a[a.length - 1][0] < 5 * 60e3) return; // at most one sample / 5 min
    a.push([now, Math.round(mcap)]);
    while (a.length && now - a[0][0] > VV.windowMs) a.shift();
    save();
  }
  function smoothed(mint, now = Date.now()) { // median over a 4h window (robust to short pumps); needs >= 3 samples spanning >= 1h
    const a = (db.mcap[mint] || []).filter(x => now - x[0] <= VV.windowMs);
    if (a.length < VV.minSamples || a[a.length - 1][0] - a[0][0] < VV.minSpanMs) return null;
    const v = a.map(x => x[1]).sort((p, q) => p - q), k = v.length >> 1;
    return v.length % 2 ? v[k] : (v[k - 1] + v[k]) / 2;
  }
  function validVamp(rec, mint, now = Date.now()) {
    if (!rec || rec.status !== 'vamp' || !rec.og) return null;
    const born = rec.firstSeen || rec.gradAt;
    const vm = smoothed(mint, now), om = smoothed(rec.og.mint, now);
    const ratio = vm && om ? vm / om : null;
    return { vv: !!(ratio && ratio >= VV.ratio && born && now - born >= VV.minAgeMs), ratio, vampMcap: vm, ogMcap: om, ageOk: !!(born && now - born >= VV.minAgeMs) };
  }
  function flippedBy(ogMint, now = Date.now()) {
    const out = [];
    for (const [m, r] of Object.entries(db.results)) if (r.og?.mint === ogMint && r.status === 'vamp') { const v = validVamp(r, m, now); if (v?.vv) out.push({ mint: m, ratio: v.ratio, symbol: r.symbol }); }
    return out.sort((a, b) => b.ratio - a.ratio);
  }
  const peekVV = mint => { const r = peek(mint); if (!r) return null; const v = validVamp(r, mint); return v ? { ...r, ...v } : r; };
  return { check, peek: peekVV, rawPeek: peek, sample, smoothed, validVamp, flippedBy, normalize, sameIdentity, db };
}
module.exports = { createOG, normalize, sameIdentity };
