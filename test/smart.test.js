'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'); const path = require('path');
const list = require('../data/smart-wallets');
const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const bytes = s => { let n = 0n; for (const c of s) { const i = A.indexOf(c); if (i < 0) return -1; n = n * 58n + BigInt(i); } let h = n.toString(16); if (h.length % 2) h = '0' + h; let z = 0; for (const c of s) { if (c === '1') z++; else break; } return h.length / 2 + z; };

test('smart-money list: valid unique Solana addresses, each with a cited public source', () => {
  const src = fs.readFileSync(path.join(__dirname, '../data/smart-wallets.js'), 'utf8');
  assert.ok(list.length >= 50 && list.length <= 150, '50-150 curated wallets');
  assert.ok(list.filter(w => w.cat === 'caller').length >= 20, 'pump.fun callers present');
  assert.equal(new Set(list.map(w => w.addr)).size, list.length);
  for (const w of list) {
    assert.equal(bytes(w.addr), 32, w.label + ' is not a 32-byte key');
    assert.ok(w.label, 'label'); assert.ok(['caller', 'trader'].includes(w.cat), w.label + ': cat must be caller|trader');
    if (w.cat === 'caller' && w.pump) assert.ok(src.includes('frontend-api-v3.pump.fun/users/' + w.pump), w.label + ': cite the pump.fun profile API');
    const line = src.split('\n').findIndex(l => l.includes(`addr: '${w.addr}'`));
    assert.match(src.split('\n')[line - 1], /^\s*\/\/ .*https:\/\/\S+/, `${w.label}: needs a citation comment with a URL right above it`);
  }
});

test('tracker keeps smart-money events per mint', async () => {
  const { createWalletTracker } = require('../lib/wallettracker');
  const t = createWalletTracker({ rpc: async () => [], log: { warn() {} } });
  t._emit({ wallet: list[0].addr, mint: 'M1', side: 'buy', sig: 's1', at: Date.now() });
  t._emit({ wallet: list[0].addr, mint: 'M1', side: 'buy', sig: 's1', at: Date.now() }); // dup ignored
  assert.equal(t.eventsFor('M1').length, 1); assert.deepEqual([...t.mints()], ['M1']);
});

test('caller stats snapshot only covers listed wallets', () => {
  const st = require('../data/caller-stats.json'); const set = new Set(list.map(w => w.addr));
  const keys = Object.keys(st.wallets); assert.ok(keys.length >= 50);
  assert.ok(keys.filter(a => set.has(a)).length >= keys.length - 5);
});

test('tracker polls a bounded number of wallets per tick, rotates, and favours hot wallets', async () => {
  const { createWalletTracker } = require('../lib/wallettracker');
  const polled = [];
  const t = createWalletTracker({ rpc: async (m, p) => { if (m === 'getSignaturesForAddress') polled.push(p[0]); return []; }, perTick: 4, log: { warn() {} } });
  t.setSource('smart', list, { backfill: 3 });
  await t.tick(); assert.equal(polled.length, 4);
  await t.tick(); assert.equal(new Set(polled).size, 8, 'rotation moves on');
  const hot = list[50].addr; t._emit({ wallet: hot, mint: 'M9', side: 'buy', sig: 'h1', at: Date.now() });
  polled.length = 0; await t.tick(); await t.tick(); assert.equal(polled.filter(a => a === hot).length, 2, 'hot wallet polled every tick');
  assert.ok(polled.length <= 8); assert.ok(t.status.rotationSec > 0);
  assert.equal(t.recent(5)[0].sig, 'h1');
});

test('first poll reads only `backfill` txs, later polls are capped', async () => {
  const { createWalletTracker } = require('../lib/wallettracker');
  let txCalls = 0; const sigs = Array.from({ length: 50 }, (_, i) => ({ signature: 's' + i, blockTime: Date.now() / 1000 }));
  const t = createWalletTracker({ rpc: async m => { if (m === 'getTransaction') { txCalls++; return null; } return sigs; }, perTick: 1, maxTxPerPoll: 7, log: { warn() {} } });
  t.setSource('smart', [list[0]], { backfill: 3 });
  await t.tick(); assert.equal(txCalls, 3);
  await t.tick(); assert.equal(txCalls, 10);
});
