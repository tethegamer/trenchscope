'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'); const path = require('path');
const list = require('../data/smart-wallets');
const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const bytes = s => { let n = 0n; for (const c of s) { const i = A.indexOf(c); if (i < 0) return -1; n = n * 58n + BigInt(i); } let h = n.toString(16); if (h.length % 2) h = '0' + h; let z = 0; for (const c of s) { if (c === '1') z++; else break; } return h.length / 2 + z; };

test('smart-money list: valid unique Solana addresses, each with a cited public source', () => {
  const src = fs.readFileSync(path.join(__dirname, '../data/smart-wallets.js'), 'utf8');
  assert.ok(list.length > 0 && list.length <= 40, 'keep the curated list short');
  assert.equal(new Set(list.map(w => w.addr)).size, list.length);
  for (const w of list) {
    assert.equal(bytes(w.addr), 32, w.label + ' is not a 32-byte key');
    assert.ok(w.label, 'label');
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
