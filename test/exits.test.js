const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const http = require('http');
const express = require('express');
const bs58 = require('bs58');
const X = require('../lib/exits');

const kp = () => { const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519'); return { pub: bs58.encode(publicKey.export({ format: 'der', type: 'spki' }).subarray(-32)), privateKey }; };
const FEE = 'EL63Jz5kAamGAFtwiunvCJsFcAZWGUmagPTHZTrcPVv6';
const BH = bs58.encode(Buffer.alloc(32, 7));
const BONK = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
const quiet = { warn() {}, log() {} };

test('config: off without JUP_API_KEY, 0.5% default, fee wallet fallback, clamps', () => {
  assert.equal(X.exitsConfig({}, FEE).enabled, false);
  const c = X.exitsConfig({ JUP_API_KEY: 'k' }, FEE, quiet);
  assert.deepEqual([c.enabled, c.feeBps, c.feeWallet], [true, 50, FEE]);
  assert.equal(X.exitsConfig({ JUP_API_KEY: 'k', EXIT_FEE_BPS: '500' }, FEE, quiet).feeBps, 100);
  assert.equal(X.exitsConfig({ JUP_API_KEY: 'k', EXIT_FEE_WALLET: 'nope' }, FEE, quiet).feeBps, 0);
  assert.equal(X.exitsConfig({ JUP_API_KEY: 'k', PAY_WALLET: BONK }, FEE, quiet).feeWallet, BONK);
  assert.equal(X.publicConfig(X.exitsConfig({}, FEE)).feeBps, 0);
});
test('fee math and exact amount conversion', () => {
  // 1,000,000 tokens (6 dp) at $0.00002 = $20 -> 0.5% = $0.10 -> at $200/SOL = 0.0005 SOL
  assert.equal(X.feeLamports({ amountRaw: '1000000000000', decimals: 6, priceUsd: 0.00002, solUsd: 200, feeBps: 50 }), 500000);
  assert.equal(X.feeLamports({ amountRaw: '1000000000', decimals: 9, solUsd: 200, feeBps: 50, isSol: true }), 5000000);
  assert.equal(X.feeLamports({ amountRaw: '1', decimals: 9, feeBps: 0 }), 0);
  assert.throws(() => X.feeLamports({ amountRaw: '1', decimals: 6, priceUsd: null, solUsd: 200, feeBps: 50 }));
  assert.equal(X.toRaw('1.5', 6), '1500000');
  assert.equal(X.toRaw('0.000000001', 9), '1');
  assert.equal(X.toRaw('12', 0), '12');
  assert.equal(X.toRaw('0.1234567', 6), '123456');
  assert.throws(() => X.toRaw('0', 6)); assert.throws(() => X.toRaw('-1', 6)); assert.throws(() => X.toRaw('1e5', 6));
});
test('fee transfer tx: system transfer layout, signature check', () => {
  const k = kp();
  const msg = X.transferMessage(k.pub, FEE, 123456789, BH);
  assert.deepEqual([...msg.subarray(0, 4)], [1, 0, 1, 3]);
  assert.equal(bs58.encode(msg.subarray(4, 36)), k.pub);
  assert.equal(bs58.encode(msg.subarray(36, 68)), FEE);
  assert.ok(msg.subarray(68, 100).equals(Buffer.alloc(32)));
  assert.equal(bs58.encode(msg.subarray(100, 132)), BH);
  const ix = msg.subarray(132);
  assert.deepEqual([...ix.subarray(0, 6)], [1, 2, 2, 0, 1, 12]);
  assert.equal(ix.readUInt32LE(6), 2); assert.equal(ix.readBigUInt64LE(10), 123456789n);
  const tx = X.unsignedTx(msg); const p = X.parseTx(tx.toString('base64'));
  assert.equal(p.sigs.length, 1); assert.ok(p.message.equals(msg));
  const sig = crypto.sign(null, msg, k.privateKey);
  assert.ok(X.verifySig(k.pub, msg, sig));
  assert.ok(!X.verifySig(FEE, msg, sig));
  assert.throws(() => X.transferMessage(FEE, FEE, 1, BH));
});
test('order validation', () => {
  const k = kp();
  const base = { depositRequestId: 'r1', depositSignedTx: 'AA==', userPubkey: k.pub, inputMint: BONK, inputAmount: '1000', outputMint: X.SOL, triggerMint: BONK, expiresAt: Date.now() + 1e6 };
  assert.equal(X.validateCreate({ ...base, orderType: 'oco', tpPriceUsd: 2, slPriceUsd: 1 }).orderType, 'oco');
  assert.throws(() => X.validateCreate({ ...base, orderType: 'oco', tpPriceUsd: 1, slPriceUsd: 2 }), /above the stop-loss/);
  assert.throws(() => X.validateCreate({ ...base, orderType: 'single', triggerCondition: 'below', triggerPriceUsd: 1, trailingBps: 500 }), /exactly one/);
  assert.equal(X.validateCreate({ ...base, orderType: 'single', triggerCondition: 'below', trailingBps: 1000 }).trailingBps, 1000);
  assert.throws(() => X.validateCreate({ ...base, orderType: 'single', triggerCondition: 'below', trailingBps: 10 }), /50-9000/);
  assert.throws(() => X.validateCreate({ ...base, orderType: 'single', triggerCondition: 'above', triggerPriceUsd: 1, expiresAt: 1 }), /future/);
  assert.equal(X.validateCreate({ ...base, orderType: 'single', triggerCondition: 'above', triggerPriceUsd: 1, evil: 'x' }).evil, undefined);
});

function serve(router) { const app = express(); app.use('/x', router); return new Promise(r => { const s = http.createServer(app).listen(0, () => r(s)); }); }
const req = async (s, method, p, body, auth = 'Bearer abcdefghijklmnop') => {
  const r = await fetch(`http://127.0.0.1:${s.address().port}/x${p}`, { method, headers: { 'content-type': 'application/json', authorization: auth }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json() };
};
test('routes: 503 when disabled', async () => {
  const s = await serve(X.createExits({ env: {}, rpc: async () => ({}), log: quiet }).router);
  try { assert.equal((await req(s, 'POST', '/auth/challenge', { walletPubkey: FEE })).status, 503); } finally { s.close(); }
});
test('routes: deposit issues fee tx; order needs the matching signed fee tx; fee sent after Jupiter accepts', async () => {
  const k = kp(); const jupCalls = []; const rpcCalls = [];
  const fetchImpl = async (url, opt) => {
    jupCalls.push({ url, body: opt.body && JSON.parse(opt.body), key: opt.headers['x-api-key'] });
    const j = url.endsWith('/deposit/craft') ? { transaction: 'AA==', requestId: 'req-1', amount: '2000000' } : url.endsWith('/orders/price') ? { id: 'order-1', txSignature: 'sig' } : {};
    return { ok: true, status: 200, json: async () => j };
  };
  const rpc = async (m, p) => { rpcCalls.push(m); if (m === 'getLatestBlockhash') return { value: { blockhash: BH } }; if (m === 'simulateTransaction') return { value: { err: null } }; if (m === 'sendTransaction') return 'feesig'; };
  const ex = X.createExits({ env: { JUP_API_KEY: 'secret' }, fallbackWallet: FEE, fetchImpl, rpc, log: quiet, priceOf: async () => 0.00002, solUsd: async () => 200, decimalsOf: async () => 6 });
  const s = await serve(ex.router);
  try {
    const d = await req(s, 'POST', '/deposit', { inputMint: BONK, outputMint: X.SOL, userAddress: k.pub, uiAmount: '1000000', orderSubType: 'oco' });
    assert.equal(d.status, 200, JSON.stringify(d.json));
    assert.equal(d.json.amount, '1000000000000');
    assert.equal(jupCalls[0].body.amount, '1000000000000'); assert.equal(jupCalls[0].key, 'secret');
    assert.equal(d.json.fee.lamports, 500000); assert.equal(d.json.fee.wallet, FEE);
    const msg = X.parseTx(d.json.fee.transaction).message;
    const order = { orderType: 'oco', depositRequestId: 'req-1', depositSignedTx: 'AA==', userPubkey: k.pub, inputMint: BONK, inputAmount: d.json.amount, outputMint: X.SOL, triggerMint: BONK, tpPriceUsd: 2, slPriceUsd: 1, expiresAt: Date.now() + 1e6 };
    // forged: someone else's signature / altered amount
    const other = kp();
    const bad = Buffer.concat([Buffer.from([1]), crypto.sign(null, msg, other.privateKey), msg]).toString('base64');
    assert.equal((await req(s, 'POST', '/orders', { ...order, feeSignedTx: bad })).status, 400);
    assert.equal((await req(s, 'POST', '/orders', order)).status, 400); // fee tx missing
    assert.ok(!jupCalls.some(c => c.url.endsWith('/orders/price')));
    const good = Buffer.concat([Buffer.from([1]), crypto.sign(null, msg, k.privateKey), msg]).toString('base64');
    const r = await req(s, 'POST', '/orders', { ...order, feeSignedTx: good });
    assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.id, 'order-1'); assert.equal(r.json.feeSig, 'feesig');
    assert.ok(rpcCalls.indexOf('sendTransaction') > rpcCalls.indexOf('simulateTransaction'));
    assert.equal(jupCalls.find(c => c.url.endsWith('/orders/price')).body.feeSignedTx, undefined); // never forwarded to Jupiter
    assert.equal((await req(s, 'POST', '/orders', { ...order, feeSignedTx: good })).status, 400); // quote used up
    assert.equal((await req(s, 'GET', '/orders', null, '')).status, 401);
    assert.equal((await req(s, 'POST', '/orders/..%2Fvault/cancel')).status, 400);
  } finally { s.close(); }
});
