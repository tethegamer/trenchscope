'use strict';
// Exits: take-profit / stop-loss, trailing stops and limit orders through Jupiter Trigger API V2
// (https://developers.jup.ag/docs/trigger). The browser wallet signs everything; this server only proxies the calls
// (so the Jupiter API key stays secret) and never holds keys or funds.
//
// Trigger V2 has no integrator-fee parameter ("There is no atomic workaround ... the only option is to run a separate
// transfer transaction outside the order flow"), so the On the Scope fee (EXIT_FEE_BPS, default 50 = 0.5%) is a plain
// SOL transfer to the fee wallet, signed together with the deposit, checked here, and only sent after Jupiter
// accepted the order. Disabled (routes answer 503, UI falls back to a jup.ag link) unless JUP_API_KEY is set.
const crypto = require('crypto');
const express = require('express');
const bs58 = require('bs58');

const BASE = 'https://api.jup.ag/trigger/v2';
const SOL = 'So11111111111111111111111111111111111111112';
const SYSTEM = Buffer.alloc(32); // 11111111111111111111111111111111
const isAddr = s => typeof s === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s) && (() => { try { return bs58.decode(s).length === 32; } catch { return false; } })();

function exitsConfig(env = process.env, fallbackWallet = null, log = console) {
  const apiKey = (env.JUP_API_KEY || '').trim();
  let feeBps = env.EXIT_FEE_BPS === undefined || env.EXIT_FEE_BPS === '' ? 50 : Math.round(+env.EXIT_FEE_BPS);
  if (!Number.isFinite(feeBps) || feeBps < 0) feeBps = 50;
  if (feeBps > 100) { log.warn?.(`[exits] EXIT_FEE_BPS=${env.EXIT_FEE_BPS} above 100; clamped to 100`); feeBps = 100; }
  let feeWallet = (env.EXIT_FEE_WALLET || env.PAY_WALLET || fallbackWallet || '').trim() || null;
  if (feeWallet && !isAddr(feeWallet)) { log.warn?.('[exits] fee wallet is not a valid Solana address; exit fee disabled'); feeWallet = null; }
  if (!feeWallet) feeBps = 0;
  return { enabled: !!apiKey, apiKey, feeBps, feeWallet };
}
const publicConfig = c => ({ enabled: c.enabled, feeBps: c.enabled ? c.feeBps : 0, feeWallet: c.enabled && c.feeBps ? c.feeWallet : null, minUsd: 10 });

// ---------- minimal legacy transaction for a System Program transfer ----------
const cu16 = n => { const o = []; for (;;) { let b = n & 0x7f; n >>= 7; if (n) { o.push(b | 0x80); } else { o.push(b); return Buffer.from(o); } } };
function readCu16(buf, off) { let n = 0, s = 0, i = off; for (;;) { const b = buf[i++]; n |= (b & 0x7f) << s; if (!(b & 0x80)) return [n, i]; s += 7; if (s > 14) throw new Error('bad length'); } }
function transferMessage(from, to, lamports, blockhash) {
  const f = Buffer.from(bs58.decode(from)), t = Buffer.from(bs58.decode(to)), bh = Buffer.from(bs58.decode(blockhash));
  if (f.length !== 32 || t.length !== 32 || bh.length !== 32) throw new Error('bad address');
  if (f.equals(t)) throw new Error('fee wallet equals payer');
  const data = Buffer.alloc(12); data.writeUInt32LE(2, 0); data.writeBigUInt64LE(BigInt(lamports), 4);
  return Buffer.concat([Buffer.from([1, 0, 1]), cu16(3), f, t, SYSTEM, bh, cu16(1), Buffer.from([2]), cu16(2), Buffer.from([0, 1]), cu16(data.length), data]);
}
/** unsigned tx (one empty signature slot) for a wallet's signTransaction */
const unsignedTx = msg => Buffer.concat([cu16(1), Buffer.alloc(64), msg]);
function parseTx(b64) {
  const buf = Buffer.from(String(b64 || ''), 'base64');
  const [n, off] = readCu16(buf, 0);
  if (n < 1 || n > 8 || buf.length < off + 64 * n + 3) throw new Error('bad transaction');
  const sigs = []; for (let i = 0; i < n; i++) sigs.push(buf.subarray(off + 64 * i, off + 64 * (i + 1)));
  return { sigs, message: buf.subarray(off + 64 * n) };
}
const ED_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
function verifySig(pubkeyB58, message, sig) {
  try { const key = crypto.createPublicKey({ key: Buffer.concat([ED_PREFIX, Buffer.from(bs58.decode(pubkeyB58))]), format: 'der', type: 'spki' }); return crypto.verify(null, message, key, sig); }
  catch { return false; }
}
/** fee in lamports for `amountRaw` (smallest units) of a token worth `priceUsd` each, paid in SOL at `solUsd` */
function feeLamports({ amountRaw, decimals, priceUsd, solUsd, feeBps, isSol }) {
  if (!feeBps) return 0;
  if (isSol) return Number((BigInt(amountRaw) * BigInt(feeBps) + 9999n) / 10000n);
  if (!(priceUsd > 0) || !(solUsd > 0)) throw new Error('price unavailable');
  const usd = (Number(amountRaw) / 10 ** decimals) * priceUsd;
  return Math.max(1, Math.ceil(((usd * feeBps) / 10000 / solUsd) * 1e9));
}
/** "1.5" + 6 decimals -> "1500000" (exact string math, no float rounding) */
function toRaw(ui, decimals) {
  const s = String(ui ?? '').trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error('invalid amount');
  const [i, f = ''] = s.split('.');
  const raw = (i + (f + '0'.repeat(decimals)).slice(0, decimals)).replace(/^0+(?=\d)/, '');
  if (!/[1-9]/.test(raw)) throw new Error('amount must be above zero');
  return raw;
}

const CREATE_FIELDS = ['orderType', 'depositRequestId', 'depositSignedTx', 'userPubkey', 'inputMint', 'inputAmount', 'outputMint', 'triggerMint', 'triggerCondition', 'triggerPriceUsd', 'trailingBps', 'slippageBps', 'tpPriceUsd', 'slPriceUsd', 'tpSlippageBps', 'slSlippageBps', 'expiresAt'];
function validateCreate(b) {
  const o = {}; for (const k of CREATE_FIELDS) if (b[k] !== undefined && b[k] !== null && b[k] !== '') o[k] = b[k];
  if (!['single', 'oco', 'otoco'].includes(o.orderType)) throw new Error('orderType must be single, oco or otoco');
  for (const k of ['userPubkey', 'inputMint', 'outputMint', 'triggerMint']) if (!isAddr(o[k])) throw new Error(k + ' is not a valid address');
  if (!/^\d+$/.test(String(o.inputAmount || ''))) throw new Error('inputAmount must be an integer string');
  if (typeof o.depositRequestId !== 'string' || o.depositRequestId.length > 100 || typeof o.depositSignedTx !== 'string') throw new Error('missing deposit');
  for (const k of ['triggerPriceUsd', 'tpPriceUsd', 'slPriceUsd']) if (k in o) { o[k] = +o[k]; if (!(o[k] > 0) || !Number.isFinite(o[k])) throw new Error(k + ' must be a positive number'); }
  for (const k of ['slippageBps', 'tpSlippageBps', 'slSlippageBps']) if (k in o) { o[k] = Math.round(+o[k]); if (!(o[k] >= 0 && o[k] <= 10000)) throw new Error(k + ' must be 0-10000'); }
  if ('trailingBps' in o) { o.trailingBps = Math.round(+o.trailingBps); if (!(o.trailingBps >= 50 && o.trailingBps <= 9000)) throw new Error('trailingBps must be 50-9000'); }
  o.expiresAt = Math.round(+o.expiresAt); if (!(o.expiresAt > Date.now())) throw new Error('expiresAt must be in the future');
  if (o.orderType === 'single') {
    if (!['above', 'below'].includes(o.triggerCondition)) throw new Error('triggerCondition must be above or below');
    if (('triggerPriceUsd' in o) === ('trailingBps' in o)) throw new Error('set exactly one of triggerPriceUsd or trailingBps');
  } else {
    if (!(o.tpPriceUsd > o.slPriceUsd)) throw new Error('take-profit price must be above the stop-loss price');
    if (o.orderType === 'otoco' && (!['above', 'below'].includes(o.triggerCondition) || !(o.triggerPriceUsd > 0))) throw new Error('otoco needs triggerCondition and triggerPriceUsd');
    delete o.trailingBps;
  }
  return o;
}

/**
 * Express router for /api/exits. deps: rpc(method, params), priceOf(mint) -> USD|null, solUsd() -> USD|null, decimalsOf(mint) -> int
 */
function createExits({ env = process.env, fallbackWallet = null, fetchImpl = fetch, rpc, priceOf, solUsd, decimalsOf, log = console }) {
  const cfg = exitsConfig(env, fallbackWallet, log);
  const quotes = new Map(); // deposit requestId -> issued fee transfer
  const hits = new Map();
  const router = express.Router();
  router.use(express.json({ limit: '64kb' }));
  const err = (res, code, msg) => res.status(code).json({ error: msg });
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!cfg.enabled) return err(res, 503, 'Limit / TP / SL orders are not configured on this server yet');
    const ip = String(req.get('x-forwarded-for') || req.ip || '').split(',')[0].trim();
    const now = Date.now(), h = (hits.get(ip) || []).filter(t => now - t < 60e3);
    if (h.length >= 60) return err(res, 429, 'Too many requests, slow down');
    h.push(now); hits.set(ip, h); if (hits.size > 5000) hits.clear();
    next();
  });
  async function jup(method, path, { auth, body } = {}) {
    const headers = { 'x-api-key': cfg.apiKey, Accept: 'application/json' };
    if (body) headers['Content-Type'] = 'application/json';
    if (auth) headers.Authorization = auth;
    const r = await fetchImpl(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(25000) });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, ok: r.ok, json: j };
  }
  const auth = req => { const a = String(req.get('authorization') || ''); return /^Bearer [\w.\-~+/=]{10,4000}$/.test(a) ? a : null; };
  const send = (res, r) => (r.ok ? res.status(r.status).json(r.json) : err(res, r.status >= 400 && r.status < 600 ? r.status : 502, r.json?.error || r.json?.message || `Jupiter error ${r.status}`));
  const wrap = fn => (req, res) => Promise.resolve(fn(req, res)).catch(e => { log.warn?.('[exits]', e.message); err(res, 502, e.message); });
  const needAuth = (req, res) => { const a = auth(req); if (!a) err(res, 401, 'Sign in with your wallet first'); return a; };

  router.post('/auth/challenge', wrap(async (req, res) => {
    const { walletPubkey } = req.body || {}; if (!isAddr(walletPubkey)) return err(res, 400, 'invalid wallet');
    send(res, await jup('POST', '/auth/challenge', { body: { walletPubkey, type: 'message' } }));
  }));
  router.post('/auth/verify', wrap(async (req, res) => {
    const { walletPubkey, signature } = req.body || {};
    if (!isAddr(walletPubkey) || typeof signature !== 'string' || signature.length > 200) return err(res, 400, 'invalid signature');
    send(res, await jup('POST', '/auth/verify', { body: { type: 'message', walletPubkey, signature, authMode: 'access_refresh' } }));
  }));
  router.post('/auth/refresh', wrap(async (req, res) => {
    const t = req.body?.refreshToken; if (typeof t !== 'string' || t.length > 4000) return err(res, 400, 'invalid refresh token');
    send(res, await jup('POST', '/auth/refresh', { body: { refreshToken: t } }));
  }));
  router.post('/auth/logout', wrap(async (req, res) => {
    const t = req.body?.refreshToken; if (typeof t !== 'string' || t.length > 4000) return res.json({ success: true });
    send(res, await jup('POST', '/auth/logout', { body: { refreshToken: t } }));
  }));
  router.get('/vault', wrap(async (req, res) => {
    const a = needAuth(req, res); if (!a) return;
    let r = await jup('GET', '/vault', { auth: a });
    if (!r.ok && r.status !== 401) r = await jup('GET', '/vault/register', { auth: a });
    send(res, r);
  }));
  router.get('/balance', wrap(async (req, res) => {
    const { owner, mint } = req.query; if (!isAddr(owner) || !isAddr(mint)) return err(res, 400, 'invalid address');
    if (mint === SOL) { const b = await rpc('getBalance', [owner, { commitment: 'confirmed' }]); return res.json({ ui: (b?.value ?? b ?? 0) / 1e9, decimals: 9 }); }
    const r = await rpc('getTokenAccountsByOwner', [owner, { mint }, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
    let ui = 0, decimals = null; for (const a of r?.value || []) { const t = a.account?.data?.parsed?.info?.tokenAmount; if (t) { ui += +t.uiAmountString || 0; decimals = t.decimals; } }
    res.json({ ui, decimals });
  }));
  // craft the deposit + the matching fee transfer (both signed by the wallet in one go)
  router.post('/deposit', wrap(async (req, res) => {
    const a = needAuth(req, res); if (!a) return;
    const { inputMint, outputMint, userAddress, uiAmount, orderSubType } = req.body || {};
    if (![inputMint, outputMint, userAddress].every(isAddr)) return err(res, 400, 'invalid address');
    if (!['single', 'oco', 'otoco'].includes(orderSubType)) return err(res, 400, 'invalid order type');
    const decimals = await decimalsOf(inputMint);
    if (!Number.isInteger(decimals)) return err(res, 502, 'Could not read token decimals');
    let amount; try { amount = toRaw(uiAmount, decimals); } catch (e) { return err(res, 400, e.message); }
    let lamports = 0, feeUsd = 0;
    if (cfg.feeBps) {
      const sol = await solUsd();
      try { lamports = feeLamports({ amountRaw: amount, decimals, priceUsd: inputMint === SOL ? sol : await priceOf(inputMint), solUsd: sol, feeBps: cfg.feeBps, isSol: inputMint === SOL }); }
      catch { return err(res, 503, "Couldn't price this token right now — try again in a moment"); }
      feeUsd = sol ? Math.round((lamports / 1e9) * sol * 100) / 100 : null;
    }
    const r = await jup('POST', '/deposit/craft', { auth: a, body: { inputMint, outputMint, userAddress, amount, orderType: 'price', orderSubType } });
    if (!r.ok || !r.json?.requestId) return send(res, r.ok ? { ok: false, status: 502, json: r.json } : r);
    let feeTx = null;
    if (lamports > 0) {
      const bh = await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }]);
      const msg = transferMessage(userAddress, cfg.feeWallet, lamports, bh.value.blockhash);
      for (const [k, q] of quotes) if (Date.now() - q.at > 15 * 60e3) quotes.delete(k);
      quotes.set(r.json.requestId, { message: msg, lamports, payer: userAddress, at: Date.now() });
      feeTx = unsignedTx(msg).toString('base64');
    }
    res.json({ ...r.json, amount, decimals, fee: { bps: cfg.feeBps, lamports, usd: feeUsd, wallet: lamports ? cfg.feeWallet : null, transaction: feeTx } });
  }));
  router.post('/orders', wrap(async (req, res) => {
    const a = needAuth(req, res); if (!a) return;
    let body; try { body = validateCreate(req.body || {}); } catch (e) { return err(res, 400, e.message); }
    const q = quotes.get(body.depositRequestId);
    let feeSigned = null;
    if (cfg.feeBps) {
      if (!q) return err(res, 400, 'Deposit expired — start again');
      if (q.payer !== body.userPubkey) return err(res, 400, 'wallet mismatch');
      if (q.lamports > 0) {
        let tx; try { tx = parseTx(req.body.feeSignedTx); } catch { return err(res, 400, 'Fee transfer missing or malformed'); }
        if (!tx.message.equals(q.message) || !verifySig(q.payer, tx.message, tx.sigs[0])) return err(res, 400, 'Fee transfer does not match the quote');
        feeSigned = String(req.body.feeSignedTx);
        const sim = await rpc('simulateTransaction', [feeSigned, { encoding: 'base64', sigVerify: true, commitment: 'confirmed' }]).catch(e => ({ value: { err: e.message } }));
        if (sim?.value?.err) return err(res, 400, `The ${(q.lamports / 1e9).toFixed(6)} SOL fee transfer would fail (${JSON.stringify(sim.value.err).slice(0, 80)}) — keep a little SOL for fees`);
      }
    }
    const r = await jup('POST', '/orders/price', { auth: a, body });
    if (!r.ok || !r.json?.id) return send(res, r.ok ? { ok: false, status: 502, json: r.json } : r);
    quotes.delete(body.depositRequestId);
    let feeSig = null, feeError = null;
    if (feeSigned) {
      try { feeSig = await rpc('sendTransaction', [feeSigned, { encoding: 'base64', preflightCommitment: 'confirmed', maxRetries: 5 }]); }
      catch (e) { feeError = e.message; log.warn?.('[exits] fee transfer failed for order', r.json.id, e.message); }
    }
    res.json({ ...r.json, feeSig, feeError });
  }));
  router.get('/orders', wrap(async (req, res) => {
    const a = needAuth(req, res); if (!a) return;
    const p = new URLSearchParams({ state: req.query.state === 'past' ? 'past' : 'active', limit: String(Math.min(50, Math.max(1, +req.query.limit || 20))) });
    if (isAddr(req.query.mint)) p.set('mint', req.query.mint);
    send(res, await jup('GET', '/orders/history?' + p, { auth: a }));
  }));
  const idOk = id => /^[A-Za-z0-9_-]{6,100}$/.test(id);
  router.post('/orders/:id/cancel', wrap(async (req, res) => {
    const a = needAuth(req, res); if (!a) return; if (!idOk(req.params.id)) return err(res, 400, 'invalid order id');
    send(res, await jup('POST', `/orders/price/cancel/${req.params.id}`, { auth: a }));
  }));
  router.post('/orders/:id/confirm-cancel', wrap(async (req, res) => {
    const a = needAuth(req, res); if (!a) return; if (!idOk(req.params.id)) return err(res, 400, 'invalid order id');
    const { signedTransaction, cancelRequestId } = req.body || {};
    if (typeof signedTransaction !== 'string' || typeof cancelRequestId !== 'string' || cancelRequestId.length > 100) return err(res, 400, 'missing signed withdrawal');
    send(res, await jup('POST', `/orders/price/confirm-cancel/${req.params.id}`, { auth: a, body: { signedTransaction, cancelRequestId } }));
  }));
  return { router, config: cfg, public: publicConfig(cfg) };
}
module.exports = { createExits, exitsConfig, publicConfig, transferMessage, unsignedTx, parseTx, verifySig, feeLamports, toRaw, validateCreate, SOL };
