// TrenchScope payments via Solana Pay (USDC or SOL). No private keys: we only READ the public chain.
// Verification approach adapted from SafeSign: each payment option has a unique `reference` pubkey; we look up
// transactions that include it and check the recipient's USDC/SOL balance delta. Signatures can't be reused.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const bs58 = require('bs58');
const QRCode = require('qrcode');

const RECIPIENT = process.env.PAY_WALLET || process.env.SOL_RECIPIENT || 'EL63Jz5kAamGAFtwiunvCJsFcAZWGUmagPTHZTrcPVv6';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const RPC_URL = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const CHECKOUT_TTL_MS = 60 * 60 * 1000;           // SOL quote valid for 1h
const WATCH_MS = 24 * 3600e3;                      // keep watching late USDC payments for 24h
const DATA_FILE = process.env.ORDERS_FILE || path.join(__dirname, '..', 'data', 'orders.json');

const PRODUCTS = {
  scope: { id: 'scope', name: 'On the Scope', priceUsd: 69, desc: 'Logo, banner, description & socials on the token page + "On the Scope" badge. Reviewed before going live.' },
  boost10: { id: 'boost10', name: '10x Boost', priceUsd: 19, boosts: 10, hours: 12 },
  boost30: { id: 'boost30', name: '30x Boost', priceUsd: 49, boosts: 30, hours: 24 },
  boost100: { id: 'boost100', name: '100x Boost', priceUsd: 129, boosts: 100, hours: 24 },
};

function load() { try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return { orders: {}, usedSignatures: {} }; } }
let db = load();
function save() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE + '.tmp', JSON.stringify(db, null, 2));
  fs.renameSync(DATA_FILE + '.tmp', DATA_FILE);
}

async function rpcOnce(method, params) {
  const r = await fetch(RPC_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  if (!r.ok) throw new Error(`RPC HTTP ${r.status}`);
  const j = await r.json(); if (j.error) throw new Error(`RPC ${j.error.message}`);
  return j.result;
}
async function rpc(method, params, tries = 4) {
  for (let i = 0; ; i++) {
    try { return await rpcOnce(method, params); }
    catch (e) { if (i >= tries - 1 || !/429|5\d\d|fetch failed/.test(e.message)) throw e; await new Promise(r => setTimeout(r, 1000 * 2 ** i)); }
  }
}
let priceCache = null;
async function solPriceUsd() {
  if (priceCache && Date.now() - priceCache.t < 60000) return priceCache.p;
  const sources = [
    async () => (await (await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd')).json()).solana.usd,
    async () => Number((await (await fetch('https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT')).json()).price),
    async () => Number((await (await fetch('https://api.coinbase.com/v2/prices/SOL-USD/spot')).json()).data.amount),
  ];
  for (const s of sources) { try { const p = await s(); if (p > 0) { priceCache = { p, t: Date.now() }; return p; } } catch {} }
  throw new Error('SOL price unavailable');
}

// Pure verification (unit-tested against real historical mainnet transactions).
function verifyTransaction(tx, { recipient, reference, currency, minAmount }) {
  if (!tx) return { ok: false, reason: 'transaction not found' };
  if (tx.meta?.err) return { ok: false, reason: 'transaction failed on-chain' };
  const keys = tx.transaction.message.accountKeys.map(k => (typeof k === 'string' ? k : k.pubkey));
  if (reference && !keys.includes(reference)) return { ok: false, reason: 'reference key not in transaction' };
  if (currency === 'USDC') {
    const sum = list => (list || []).filter(b => b.mint === USDC_MINT && b.owner === recipient).reduce((s, b) => s + BigInt(b.uiTokenAmount.amount), 0n);
    const delta = sum(tx.meta.postTokenBalances) - sum(tx.meta.preTokenBalances);
    const need = BigInt(Math.round(minAmount * 1e6)); const received = Number(delta) / 1e6;
    return delta >= need ? { ok: true, received } : { ok: false, reason: `recipient received ${received} USDC, need ${minAmount}`, received };
  }
  if (currency === 'SOL') {
    const i = keys.indexOf(recipient);
    if (i < 0) return { ok: false, reason: 'recipient not in transaction' };
    const delta = BigInt(tx.meta.postBalances[i]) - BigInt(tx.meta.preBalances[i]);
    const need = BigInt(Math.round(minAmount * 1e9)); const received = Number(delta) / 1e9;
    return delta >= need ? { ok: true, received } : { ok: false, reason: `recipient received ${received} SOL, need ${minAmount}`, received };
  }
  return { ok: false, reason: 'unknown currency' };
}

function payUrl({ currency, amount, reference, label }) {
  const q = { amount: String(amount), ...(currency === 'USDC' ? { 'spl-token': USDC_MINT } : {}), reference, label: 'TrenchScope', message: label, memo: 'trenchscope' };
  return `solana:${RECIPIENT}?` + Object.entries(q).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}

async function createOrder(productId, mint, details = {}) {
  const p = PRODUCTS[productId]; if (!p) throw new Error('unknown product');
  const solUsd = await solPriceUsd().catch(() => null);
  const options = [];
  const mk = async (currency, amount) => {
    const reference = bs58.encode(crypto.randomBytes(32));
    const url = payUrl({ currency, amount, reference, label: `${p.name} for ${mint.slice(0, 6)}…` });
    options.push({ currency, amount, reference, url, qr: await QRCode.toDataURL(url, { margin: 1, width: 240 }) });
  };
  await mk('USDC', p.priceUsd);
  if (solUsd) await mk('SOL', Math.ceil((p.priceUsd / solUsd) * 1e6) / 1e6);
  const id = crypto.randomBytes(10).toString('hex');
  db.orders[id] = { id, product: productId, mint, details, priceUsd: p.priceUsd, created: Date.now(), solUsd, status: 'pending', options: options.map(({ qr, ...o }) => o) };
  save();
  return { ...publicOrder(db.orders[id]), recipient: RECIPIENT, options };
}
function publicOrder(o) {
  if (!o) return null;
  const { options, payment, details, ...rest } = o;
  return { ...rest, recipient: RECIPIENT, options: (options || []).map(({ currency, amount, url }) => ({ currency, amount, url })), paid: !!payment, payment: payment ? { currency: payment.currency, amount: payment.amount, signature: payment.signature } : null };
}

let rpcCall = rpc;
async function checkOrder(id) {
  const o = db.orders[id];
  if (!o) return null;
  if (o.status !== 'pending') return publicOrder(o);
  for (const opt of o.options) {
    const sigs = await rpcCall('getSignaturesForAddress', [opt.reference, { limit: 10, commitment: 'confirmed' }]);
    for (const s of sigs || []) {
      if (s.err || db.usedSignatures[s.signature]) continue;
      if (opt.currency === 'SOL' && s.blockTime && s.blockTime * 1000 > o.created + CHECKOUT_TTL_MS) continue;
      const tx = await rpcCall('getTransaction', [s.signature, { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]);
      const v = verifyTransaction(tx, { recipient: RECIPIENT, reference: opt.reference, currency: opt.currency, minAmount: opt.amount });
      if (v.ok) { markPaid(o, s.signature, opt.currency, v.received); return publicOrder(o); }
      o.lastError = v.reason;
    }
  }
  if (Date.now() > o.created + WATCH_MS) { o.status = 'expired'; save(); }
  return publicOrder(o);
}
function markPaid(o, signature, currency, amount) {
  const p = PRODUCTS[o.product];
  o.payment = { signature, currency, amount, at: Date.now() };
  db.usedSignatures[signature] = o.id;
  if (p.boosts) { o.status = 'active'; o.startsAt = Date.now(); o.endsAt = Date.now() + p.hours * 3600e3; }
  else o.status = 'review'; // On the Scope: owner must approve
  save();
}
function review(id, approve, note) {
  const o = db.orders[id];
  if (!o || o.product !== 'scope' || o.status !== 'review') throw new Error('order not awaiting review');
  o.status = approve ? 'approved' : 'rejected'; o.reviewedAt = Date.now(); if (note) o.reviewNote = String(note).slice(0, 300);
  save(); return o;
}

// ---------- read models ----------
function activeBoosts() { // mint -> total active paid boosts
  const now = Date.now(), out = {};
  for (const o of Object.values(db.orders)) if (o.status === 'active' && o.endsAt > now) out[o.mint] = (out[o.mint] || 0) + PRODUCTS[o.product].boosts;
  return out;
}
function scopeInfo(mint) { // latest approved On the Scope profile
  const list = Object.values(db.orders).filter(o => o.product === 'scope' && o.mint === mint && o.status === 'approved').sort((a, b) => b.reviewedAt - a.reviewedAt);
  return list[0] ? { ...list[0].details, approvedAt: list[0].reviewedAt } : null;
}
function scopedMints() { return new Set(Object.values(db.orders).filter(o => o.product === 'scope' && o.status === 'approved').map(o => o.mint)); }
function allOrders() { return Object.values(db.orders).sort((a, b) => b.created - a.created); }

function _testHooks() { return { setRpc: f => { rpcCall = f; }, db: () => db, reset: () => { db = { orders: {}, usedSignatures: {} }; } }; }
module.exports = { PRODUCTS, RECIPIENT, USDC_MINT, verifyTransaction, createOrder, checkOrder, review, activeBoosts, scopeInfo, scopedMints, allOrders, publicOrder, rpc, _testHooks };
