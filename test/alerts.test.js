'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'); const os = require('os'); const path = require('path');
const { createAlerts } = require('../lib/alerts');
const { createWalletTracker, parseTrades } = require('../lib/wallettracker');

const W = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const M = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ots-al-'));
const quiet = { log() {}, warn() {} };
const sid = 'a'.repeat(32);

function txBuy({ sol = -1.002, amt = 1000, wallet = W, mint = M } = {}) {
  return { blockTime: Math.floor(Date.now() / 1000), transaction: { signatures: ['sig' + Math.random()], message: { accountKeys: [{ pubkey: wallet }] } },
    meta: { err: null, fee: 5000, preBalances: [5e9], postBalances: [5e9 + sol * 1e9 - 5000], preTokenBalances: [], postTokenBalances: [{ owner: wallet, mint, uiTokenAmount: { uiAmountString: String(amt) } }] } };
}

test('parseTrades: buy with SOL, sell, and ignores plain transfers', () => {
  const b = parseTrades(txBuy(), W); assert.equal(b.length, 1); assert.equal(b[0].side, 'buy'); assert.ok(Math.abs(b[0].sol - 1.002) < 1e-6);
  const sellTx = txBuy({ sol: 2 }); sellTx.meta.preTokenBalances = [{ owner: W, mint: M, uiTokenAmount: { uiAmountString: '500' } }]; sellTx.meta.postTokenBalances = [];
  const s = parseTrades(sellTx, W); assert.equal(s[0].side, 'sell'); assert.equal(s[0].amount, 500);
  assert.equal(parseTrades(txBuy({ sol: 0 }), W).length, 0, 'airdrop/transfer in is not a buy');
  assert.equal(parseTrades({ ...txBuy(), meta: { ...txBuy().meta, err: {} } }, W).length, 0);
});

test('VAPID keys auto-generate with a warning and persist to the data dir', () => {
  const dir = tmp(); const warns = [];
  const a = createAlerts({ env: {}, dataDir: dir, getPrices: async () => new Map(), ogPeek: () => null, ogResults: () => ({}), baseUrl: () => 'http://x', log: { log() {}, warn: m => warns.push(m) } });
  assert.ok(a.vapidPublicKey.length > 60); assert.ok(warns.some(w => /WARNING/.test(w)));
  assert.ok(fs.existsSync(path.join(dir, 'vapid.json')));
  const b = createAlerts({ env: {}, dataDir: dir, getPrices: async () => new Map(), ogPeek: () => null, ogResults: () => ({}), baseUrl: () => 'http://x', log: quiet });
  assert.equal(b.vapidPublicKey, a.vapidPublicKey, 'reuses saved keys');
});

test('sync validates input, price targets fire once via Telegram and report back', async () => {
  const sent = [];
  const fetchImpl = async (url, o) => { const body = JSON.parse(o.body); sent.push({ url, body }); return { status: 200, json: async () => ({ ok: true, result: { message_id: 1 } }) }; };
  let price = 1;
  const a = createAlerts({ env: { TELEGRAM_ALERTS_BOT_TOKEN: 'T' }, dataDir: tmp(), fetchImpl, getPrices: async ms => new Map(ms.map(m => [m, { priceUsd: price, symbol: 'BONK' }])), ogPeek: () => null, ogResults: () => ({}), baseUrl: () => 'https://ots.example', log: quiet });
  assert.throws(() => a.sync({ sid: 'nope' }), /bad sid/);
  const r = a.sync({ sid, watch: [{ mint: M, symbol: 'BONK' }, { mint: 'bad' }], targets: [{ id: 1, mint: M, symbol: 'BONK', dir: 'above', price: 2 }], prefs: { movePct: 999 } });
  assert.equal(r.prefs.movePct, 100); assert.equal(a._subs()[sid].watch.length, 1); assert.ok(r.telegram.code);
  await a._onTg({ chat: { id: 42 }, text: '/start ' + r.telegram.code });
  assert.equal(a._subs()[sid].tg, '42');
  await a.tick(); // primes the move baseline, target not hit
  sent.length = 0; price = 2.5; await a.tick();
  const msgs = sent.filter(s => s.url.endsWith('/sendMessage')).map(s => s.body.text);
  assert.ok(msgs.some(t => /BONK above/.test(t)), 'target alert'); assert.ok(msgs.some(t => /\+150\.0%/.test(t)), 'move alert');
  assert.ok(msgs.every(t => t.includes('https://ots.example/token/' + M)));
  const r2 = a.sync({ sid, watch: [], targets: [] }); assert.deepEqual(r2.fired, ['1']);
  // signed link restores Telegram after a restart, forged one does not
  const b = createAlerts({ env: { TELEGRAM_ALERTS_BOT_TOKEN: 'T', ALERTS_FILE: path.join(tmp(), 'x.json') }, dataDir: tmp(), fetchImpl, getPrices: async () => new Map(), ogPeek: () => null, ogResults: () => ({}), baseUrl: () => 'x', log: quiet });
  assert.equal(b.sync({ sid, tgLink: '99.forged' }).telegram.linked, false);
  assert.equal(b.sync({ sid, tgLink: r2.telegram.link }).telegram.linked, true);
});

test('tracked wallet trade reaches the subscriber who tracks it', async () => {
  const sent = [];
  const fetchImpl = async (url, o) => { sent.push(JSON.parse(o.body)); return { status: 200, json: async () => ({ ok: true, result: {} }) }; };
  const tracker = createWalletTracker({ rpc: async () => [], log: quiet });
  const a = createAlerts({ env: { TELEGRAM_ALERTS_BOT_TOKEN: 'T' }, dataDir: tmp(), fetchImpl, tracker, getPrices: async () => new Map([[M, { symbol: 'BONK', priceUsd: 0.00002 }]]), ogPeek: () => null, ogResults: () => ({}), baseUrl: () => 'x', log: quiet });
  const r = a.sync({ sid, wallets: [{ addr: W, label: 'Whale' }] });
  await a._onTg({ chat: { id: 7 }, text: '/start ' + r.telegram.code });
  a.sync({ sid, wallets: [{ addr: W, label: 'Whale' }] });
  assert.equal(tracker.status.wallets, 1);
  // simulate the tracker emitting a live trade
  const rpcCalls = [];
  const t2 = createWalletTracker({ rpc: async (m, p) => { rpcCalls.push(m); if (m === 'getSignaturesForAddress') return p[1].until ? [{ signature: 'new' }] : [{ signature: 'old' }]; return txBuy(); }, log: quiet });
  const got = []; t2.onTrade(e => got.push(e)); t2.setSource('users', [{ addr: W, label: 'Whale' }]);
  await t2.tick(); assert.equal(got.length, 0, 'first poll only primes');
  await t2.tick(); assert.equal(got.length, 1); assert.equal(got[0].live, true);
  // feed into the alerts' tracker
  sent.length = 0;
  tracker._emit({ ...got[0], labels: [{ label: 'Whale', source: 'users' }] });
  await new Promise(r => setTimeout(r, 20));
  assert.equal(sent.length, 1); assert.match(sent[0].text, /Whale bought BONK/); assert.match(sent[0].text, /1\.00 SOL/);
});
