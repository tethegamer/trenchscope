// Unit tests for name normalization + live OG check on a real vamped name.
const assert = require('assert');
const { normalize, sameIdentity } = require('../lib/og');
assert.equal(normalize('streamoors.fun'), 'streamoors');
assert.equal(normalize('Streamoors'), 'streamoors');
assert.equal(normalize('The BONK Coin 🚀'), 'bonk');
assert.equal(normalize('$WIF'), 'wif');
assert.equal(normalize('Flying  Tesla Roadster'), 'flyingteslaroadster');
assert.ok(sameIdentity({ name: 'Flying Tesla Roadster', symbol: 'FTR' }, { name: 'flying tesla roadster', symbol: 'ftr' }));
assert.ok(sameIdentity({ name: 'streamoors.fun', symbol: 'STREAM' }, { name: 'Streamoors', symbol: 'STREAM' }));
assert.ok(!sameIdentity({ name: 'Streamflow', symbol: 'STREAM' }, { name: 'streamoors', symbol: 'STREAM' }));
console.log('✓ normalize / sameIdentity');
// Valid Vamp: smoothed mcap >= 3x OG and >= 24h old; dynamic
{
  const os = require('os'), fs = require('fs'), path = require('path');
  const { createOG } = require('../lib/og');
  const o = createOG({ getJSON: async () => ({}), cached: async (k, t, f) => f(), file: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vv-')), 'og.json') });
  const H = 3600e3, now = Date.now(), OG = 'OGmint1111111111111111111111111111', V = 'Vamp11111111111111111111111111111';
  const rec = { status: 'vamp', og: { mint: OG, symbol: 'OG' }, firstSeen: now - 30 * H };
  const feed = (m, vals) => vals.forEach((v, i) => o.sample(m, v, now - (vals.length - 1 - i) * 30 * 60e3));
  feed(OG, [1e6, 1e6, 1e6, 1e6]);
  feed(V, [2e6, 2e6, 2e6, 40e6]);                 // one 40x spike can't fake it (median)
  assert.equal(o.validVamp(rec, V, now).vv, false);
  const V2 = 'Vamp22222222222222222222222222222';
  feed(V2, [1e6, 1e6, 1e6, 9e6]);                  // short pump to 9x -> not VV
  assert.equal(o.validVamp(rec, V2, now).vv, false);
  const V3 = 'Vamp33333333333333333333333333333';
  feed(V3, [3.2e6, 3.2e6, 3.2e6, 3.2e6]);          // 3.2x (>= 3x) -> VV!
  assert.equal(o.validVamp(rec, V3, now).vv, true);
  assert.equal(o.validVamp({ ...rec, firstSeen: now - 10 * H }, V3, now).vv, false, 'under 24h');
  o.db.results[V3] = rec; assert.equal(o.flippedBy(OG, now)[0].mint, V3);
  // dynamic: drops under 3x later -> loses VV
  [2e6, 2e6, 2e6, 2e6, 2e6, 2e6, 2e6, 2e6, 2e6].forEach((v, i) => o.sample(V3, v, now + (i + 1) * 30 * 60e3));
  [1e6, 1e6, 1e6, 1e6, 1e6, 1e6, 1e6, 1e6, 1e6].forEach((v, i) => o.sample(OG, v, now + (i + 1) * 30 * 60e3));
  assert.equal(o.validVamp(rec, V3, now + 270 * 60e3).vv, false);
  const V4 = 'Vamp44444444444444444444444444444'; o.sample(V4, 9e6, now);
  assert.equal(o.validVamp(rec, V4, now).ratio, null, 'needs history');
  console.log('✓ Valid Vamp (VV) rules');
}
if (process.argv.includes('--offline')) process.exit(0);
const { app } = require('../server');
const srv = app.listen(0, async () => {
  const base = `http://localhost:${srv.address().port}`;
  try {
    // Real example (verified 2026-10-16): "Flying Tesla Roadster" (FTR) — DFMt…pump graduated to PumpSwap on 2026-10-14,
    // but 3w5c… had a Raydium pair since 2026-08-14, so DFMt is a vamp.
    const d = await (await fetch(base + '/api/token/DFMt2FyLpB6ekPNAzVErLXgpSnJ9CRf1VnxBAkTLpump')).json();
    console.log('FTR (DFMt):', d.og?.status, '→ OG', d.og?.og?.symbol, d.og?.og?.mint, new Date(d.og?.og?.gradAt).toISOString());
    assert.equal(d.og.status, 'vamp');
    const o = await (await fetch(base + '/api/token/' + d.og.og.mint)).json();
    console.log('OG token:', o.symbol, o.og?.status, 'vamps:', o.og?.vamps);
    assert.equal(o.og.status, 'og');
    console.log('✓ live OG/VAMP'); process.exit(0);
  } catch (e) { console.error('✗', e.message); process.exit(1); }
});
