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
if (process.argv.includes('--offline')) process.exit(0);
const { app } = require('../server');
const srv = app.listen(0, async () => {
  const base = `http://localhost:${srv.address().port}`;
  try {
    // Real example (verified 2026-10-16): "Flying Tesla Roadster" (FTR) — DFMt…pump graduated to PumpSwap on 2026-10-14,
    // but 3w5c… had a Raydium pair since 2026-08-14, so DFMt is a copycat.
    const d = await (await fetch(base + '/api/token/DFMt2FyLpB6ekPNAzVErLXgpSnJ9CRf1VnxBAkTLpump')).json();
    console.log('FTR (DFMt):', d.og?.status, '→ OG', d.og?.og?.symbol, d.og?.og?.mint, new Date(d.og?.og?.gradAt).toISOString());
    assert.equal(d.og.status, 'copycat');
    const o = await (await fetch(base + '/api/token/' + d.og.og.mint)).json();
    console.log('OG token:', o.symbol, o.og?.status, 'copycats:', o.og?.copycats);
    assert.equal(o.og.status, 'og');
    console.log('✓ live OG/copycat'); process.exit(0);
  } catch (e) { console.error('✗', e.message); process.exit(1); }
});
