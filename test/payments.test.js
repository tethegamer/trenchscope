// Payment verification against REAL historical mainnet transactions (fixtures, re-fetched live when possible).
// No real payments are made. Run: node --test test/payments.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'); const os = require('os'); const path = require('path');
process.env.ORDERS_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ts-')), 'orders.json');
// make the fixture's USDC recipient act as "owner wallet" for the end-to-end order flow
process.env.PAY_WALLET = '5ipJ3j8U6zwe1c3oKz53zFyxPgfM2vtPujty7gNryFyR';
const pay = require('../lib/payments');

const USDC_SIG = '47kLJu4bYpy5MMMD5apj9i24PDiQBhv1Ujed865foFex5NfamqPoTbo3nBonJaCKx4QCqcweTzteEPXnahx9d6ZF';
const SOL_SIG = '2n3A24nVwbU68Zik2JfTwqaJJDCtWukKP9TqLbMSpFLoVs3yqP1W9RGruh8FPRXUSvRLXXWy5CJvshFNSLtqcZJL';
const usdcTx = require('./fixtures/usdc-transfer.json'); // 6000 USDC -> 5ipJ3j8U...
const solTx = require('./fixtures/sol-transfer.json');   // 0.2477784 SOL -> FDV1co3E...
const U = { recipient: '5ipJ3j8U6zwe1c3oKz53zFyxPgfM2vtPujty7gNryFyR', reference: '7KJjY7rArbydeLBF7gQ5LdqXRKRYyPArT99NEctsHsgU', currency: 'USDC' };
const S = { recipient: 'FDV1co3EJb9tPJYMp25GKYiMAhGmdZmgDLKAUdgeGZU6', reference: '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9', currency: 'SOL' };
const OWNER = 'EL63Jz5kAamGAFtwiunvCJsFcAZWGUmagPTHZTrcPVv6';
const MINT = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';

test('USDC: accepts correct recipient + amount, rejects underpayment', () => {
  assert.ok(pay.verifyTransaction(usdcTx, { ...U, minAmount: 69 }).ok);
  assert.strictEqual(pay.verifyTransaction(usdcTx, { ...U, minAmount: 69 }).received, 6000);
  assert.ok(!pay.verifyTransaction(usdcTx, { ...U, minAmount: 6000.000001 }).ok);
});
test('USDC: rejects payment to someone else (e.g. not the owner wallet)', () => assert.ok(!pay.verifyTransaction(usdcTx, { ...U, recipient: OWNER, minAmount: 19 }).ok));
test('USDC: rejects tx without our reference key', () => assert.match(pay.verifyTransaction(usdcTx, { ...U, reference: OWNER, minAmount: 19 }).reason, /reference/));
test('USDC tx is not a SOL payment', () => assert.ok(!pay.verifyTransaction(usdcTx, { ...U, currency: 'SOL', minAmount: 0.01 }).ok));
test('SOL: exact amount ok, 1 lamport more rejected, wrong recipient rejected', () => {
  assert.ok(pay.verifyTransaction(solTx, { ...S, minAmount: 0.2477784 }).ok);
  assert.ok(!pay.verifyTransaction(solTx, { ...S, minAmount: 0.2477785 }).ok);
  assert.ok(!pay.verifyTransaction(solTx, { ...S, recipient: OWNER, minAmount: 0.1 }).ok);
});
test('failed tx rejected', () => {
  const bad = JSON.parse(JSON.stringify(usdcTx)); bad.meta.err = { InstructionError: [0, 'x'] };
  assert.ok(!pay.verifyTransaction(bad, { ...U, minAmount: 9 }).ok);
});

function forceOption(id, amount) { // point the order's USDC option at the historical tx's reference
  const o = pay._testHooks().db().orders[id];
  o.options = [{ currency: 'USDC', amount, reference: U.reference, url: 'x' }];
}
test('On the Scope order: pending -> paid -> review -> approved shows profile; signature not reusable', async () => {
  const h = pay._testHooks();
  h.setRpc(async m => m === 'getSignaturesForAddress' ? [{ signature: USDC_SIG, err: null, blockTime: usdcTx.blockTime }] : usdcTx);
  const o = await pay.createOrder('scope', MINT, { logo: 'https://x/logo.png', description: 'A test description long enough' });
  assert.strictEqual(o.status, 'pending'); assert.ok(o.options[0].url.startsWith('solana:'));
  forceOption(o.id, 69); assert.strictEqual(o.priceUsd, 69); assert.strictEqual(o.options[0].amount, 69);
  assert.strictEqual(pay.scopeInfo(MINT), null);
  const paid = await pay.checkOrder(o.id);
  assert.strictEqual(paid.status, 'review'); assert.strictEqual(paid.payment.amount, 6000);
  assert.strictEqual(pay.scopeInfo(MINT), null, 'not live before approval');
  pay.review(o.id, true);
  assert.strictEqual(pay.scopeInfo(MINT).description, 'A test description long enough');
  assert.ok(pay.scopedMints().has(MINT));
  // same signature cannot pay a second order
  const o2 = await pay.createOrder('boost30', MINT); forceOption(o2.id, 49);
  assert.strictEqual((await pay.checkOrder(o2.id)).status, 'pending');
});
test('Boost order activates immediately and counts toward ranking', async () => {
  const h = pay._testHooks(); h.db().usedSignatures = {};
  const o = await pay.createOrder('boost100', MINT); forceOption(o.id, 129);
  const r = await pay.checkOrder(o.id);
  assert.strictEqual(r.status, 'active'); assert.ok(r.endsAt - r.startsAt === 24 * 3600e3);
  assert.strictEqual(pay.activeBoosts()[MINT], 100);
});
test('underpaid order stays pending with reason', async () => {
  const h = pay._testHooks(); h.db().usedSignatures = {};
  const o = await pay.createOrder('scope', MINT, {}); forceOption(o.id, 6001);
  const r = await pay.checkOrder(o.id);
  assert.strictEqual(r.status, 'pending'); assert.match(h.db().orders[o.id].lastError, /need 6001/);
});
test('live: re-fetch historical txs from public RPC and verify', async t => {
  let live;
  try { live = await Promise.all([USDC_SIG, SOL_SIG].map(s => pay.rpc('getTransaction', [s, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]))); }
  catch (e) { t.skip('RPC unavailable: ' + e.message); return; }
  assert.ok(pay.verifyTransaction(live[0], { ...U, minAmount: 69 }).ok);
  assert.ok(pay.verifyTransaction(live[1], { ...S, minAmount: 0.2 }).ok);
});
