// Unit tests for the wallet PnL estimator (public/pnl-core.js)
const test = require('node:test');
const assert = require('assert');
const P = require('../public/pnl-core.js');

const W = 'Wa11et1111111111111111111111111111111111111';
const MINT = 'Tok3n11111111111111111111111111111111111111';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const tb = (mint, amt, owner = W) => ({ mint, owner, uiTokenAmount: { uiAmountString: String(amt) } });
const tx = ({ t, solPre = 10, solPost = 10, pre = [], post = [], err = null }) => ({
  blockTime: t, transaction: { signatures: ['sig' + t], message: { accountKeys: [{ pubkey: W }, { pubkey: 'Other' }] } },
  meta: { err, preBalances: [solPre * 1e9, 0], postBalances: [solPost * 1e9, 0], preTokenBalances: pre, postTokenBalances: post },
});

test('parseTx extracts SOL and token deltas for the wallet only', () => {
  const r = P.parseTx(tx({ t: 1000, solPre: 10, solPost: 9, pre: [tb(MINT, 0), tb(MINT, 50, 'Pool')], post: [tb(MINT, 1000), tb(MINT, 0, 'Pool')] }), W);
  assert.equal(r.sol, -1); assert.deepEqual(r.tk, { [MINT]: 1000 }); assert.equal(r.t, 1000e3);
  assert.ok(P.parseTx(tx({ t: 1, err: { x: 1 } }), W).x, 'failed tx ignored');
  assert.ok(P.parseTx(tx({ t: 1, solPre: 5, solPost: 4 }), W).x, 'plain SOL transfer ignored');
});

test('classify: SOL buy, USDC sell, airdrop', () => {
  const px = () => 100;
  const buy = P.classify(P.parseTx(tx({ t: 1, solPre: 10, solPost: 9, post: [tb(MINT, 1000)] }), W), px);
  assert.equal(buy.kind, 'buy'); assert.equal(buy.usd, 100); assert.equal(buy.qty, 1000);
  const sell = P.classify(P.parseTx(tx({ t: 2, solPre: 9, solPost: 8.99999, pre: [tb(MINT, 1000), tb(USDC, 0)], post: [tb(MINT, 0), tb(USDC, 250)] }), W), px);
  assert.equal(sell.kind, 'sell'); assert.equal(sell.usd, 250);
  const air = P.classify(P.parseTx(tx({ t: 3, solPre: 9, solPost: 8.999995, post: [tb(MINT, 5)] }), W), px);
  assert.equal(air.kind, 'in');
});

test('computePnl: average cost realized + unrealized + periods', () => {
  const now = Date.UTC(2026, 9, 17, 12);
  const h = 3600e3;
  const ev = [
    { s: 'a', t: now - 40 * 24 * h, kind: 'buy', mint: MINT, qty: 100, usd: 100 },
    { s: 'b', t: now - 3 * 24 * h, kind: 'buy', mint: MINT, qty: 100, usd: 300 }, // avg = 2
    { s: 'c', t: now - 2 * h, kind: 'sell', mint: MINT, qty: 50, usd: 250 },       // realized 250 - 100 = 150
    { s: 'd', t: now - h, kind: 'sell', mint: 'Other', qty: 10, usd: 10 },          // no buy in range -> unmatched
  ];
  const r = P.computePnl(ev, { prices: { [MINT]: 3 }, balances: { [MINT]: 150 }, now });
  assert.equal(Math.round(r.realized), 150);
  assert.equal(Math.round(r.unrealized), 150); // 150 * (3 - 2)
  assert.equal(Math.round(r.total), 300);
  assert.equal(Math.round(r.periods.d1.realized), 150);
  assert.equal(Math.round(r.periods.d7.volume), 300 + 250 + 10);
  assert.equal(Math.round(r.periods.d30.volume), 560);
  assert.equal(Math.round(r.volume), 660);
  assert.equal(r.unmatchedSells, 1);
  assert.equal(r.days.length, 30); assert.equal(Math.round(r.days[29].pnl), 150);
  assert.equal(r.winRate, 0.5);
});

test('solPriceFn picks hourly, then daily, then now', () => {
  const f = P.solPriceFn({ hourly: [[1000, 150], [4600, 151]], daily: [[0, 140]], now: 160 });
  assert.equal(f(4700e3), 151); assert.equal(f(2000e3), 150);
  assert.equal(f(-50000e3), 140); assert.equal(f(9e12), 160);
});
