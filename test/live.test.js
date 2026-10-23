const test = require('node:test'); const assert = require('node:assert');
const { createLiveFeed, rowFromPumpPortal, applyMeta } = require('../lib/livefeed');
const MINT = '5CyZGThMuUVanTyZC27MDKvNygEBuzUN6CGYZd4QbrVi', CRE = 'BsqoT5KJPphA3PkbTTXYNZHXm6HSbrT4D2Y4bBsdHve3';
const msg = (o = {}) => ({ txType: 'create', mint: MINT, symbol: 'TEST', name: 'Test', uri: 'https://ipfs.io/ipfs/x', traderPublicKey: CRE, signature: 'sig', bondingCurveKey: CRE, solAmount: 1.5, marketCapSol: 30, pool: 'pump', ...o });

test('rowFromPumpPortal parses a pump.fun create', () => {
  const r = rowFromPumpPortal(msg(), 100, 1000);
  assert.equal(r.mint, MINT); assert.equal(r.src, 'pump.fun'); assert.equal(r.mcap, 3000); assert.equal(r.priceUsd, 3000 / 1e9);
  assert.equal(r.createdAt, 1000); assert.equal(r.live, true); assert.equal(r.devBuySol, 1.5);
  assert.equal(rowFromPumpPortal(msg({ pool: 'bonk' }), 100).src, 'letsbonk');
  assert.equal(rowFromPumpPortal(msg(), null).mcap, null);
});
test('rowFromPumpPortal rejects non-create and bad mints', () => {
  assert.equal(rowFromPumpPortal(msg({ txType: 'buy' }), 100), null);
  assert.equal(rowFromPumpPortal(msg({ mint: 'not-a-mint!' }), 100), null);
  assert.equal(rowFromPumpPortal(null, 100), null);
});
test('applyMeta only accepts http(s) links', () => {
  const r = applyMeta(rowFromPumpPortal(msg(), 100), { image: 'https://img/x.png', twitter: 'javascript:alert(1)', telegram: 'https://t.me/x', website: 'https://x.io' });
  assert.equal(r.icon, 'https://img/x.png'); assert.ok(!JSON.stringify(r.socials).includes('javascript'));
});
function fakeWS() {
  const socks = [];
  class WS { constructor(u) { this.u = u; this.h = {}; this.sent = []; socks.push(this); setImmediate(() => this.h.open?.()); } on(e, f) { this.h[e] = f; } send(s) { this.sent.push(s); } close() { this.h.close?.(); } terminate() {} }
  return { WS, socks };
}
test('feed subscribes, dedups, buffers and emits to solana watchers only', async () => {
  const { WS, socks } = fakeWS();
  const feed = createLiveFeed({ WebSocket: WS, fetchJSON: async () => ({}), solUsd: () => 100, pollPairs: async () => [], log: () => {}, env: {} });
  const got = [], other = [];
  const off = feed.watch('solana', e => got.push(e)); const off2 = feed.watch('base', e => other.push(e));
  feed.start(); await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r));
  assert.match(socks[0].sent[0], /subscribeNewToken/);
  socks[0].h.message(JSON.stringify(msg())); socks[0].h.message(JSON.stringify(msg()));
  assert.equal(feed.recent().length, 1); assert.equal(got.filter(e => e.type === 'token').length, 1); assert.equal(other.length, 0);
  off(); off2(); feed.stop();
});
test('DEX poll seeds first, then emits only unseen pairs', async () => {
  let n = 0; const A = { mint: MINT, pair: 'p1', createdAt: 1 }, B = { mint: CRE, pair: 'p2', createdAt: 2 };
  const feed = createLiveFeed({ WebSocket: null, fetchJSON: async () => ({}), solUsd: () => 100, pollPairs: async () => (n++ ? [B, A] : [A]), log: () => {}, env: { DEX_POLL_MS: '8000' } });
  const got = []; const off = feed.watch('base', e => got.push(e));
  await feed._pollNow?.('base'); await feed._pollNow?.('base');
  if (feed._pollNow) { assert.equal(got.length, 1); assert.equal(got[0].row.mint, CRE); assert.equal(got[0].row.live, true); }
  off(); feed.stop();
});
