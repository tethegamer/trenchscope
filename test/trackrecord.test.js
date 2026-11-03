const test = require('node:test');
const assert = require('node:assert');
const os = require('os'); const path = require('path');
const { createTrackRecord } = require('../lib/trackrecord');
test('track record logs first sight once and scores 24h / 7d outcomes per bucket', async () => {
  let t = 1e12; const prices = new Map([['A', { price: 2, liq: 9000 }], ['B', { price: 0.05, liq: 100 }]]);
  const tr = createTrackRecord({ file: path.join(os.tmpdir(), 'tr-' + process.pid + '.json'), fetchPrices: async ms => new Map(ms.map(m => [m, prices.get(m)])), now: () => t });
  assert.ok(tr.record({ mint: 'A', t: 80, price: 1, liq: 10000 }));
  assert.ok(!tr.record({ mint: 'A', t: 10, price: 5 })); // first sight only
  assert.ok(tr.record({ mint: 'B', t: 30, price: 1, liq: 10000 }));
  assert.equal(await tr.check(), 0);
  t += 25 * 3600e3; assert.equal(await tr.check(), 2);
  const s = tr.stats();
  assert.equal(s.buckets.high.h24.n, 1); assert.equal(s.buckets.high.h24.rugPct, 0); assert.equal(s.buckets.high.h24.medianChangePct, 100);
  assert.equal(s.buckets.low.h24.rugPct, 100);
  t += 7 * 24 * 3600e3; assert.equal(await tr.check(), 2); assert.equal(tr.stats().buckets.high.d7.n, 1);
});
