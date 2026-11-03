// Exits on the token page: take-profit / stop-loss, trailing stop and limit orders via Jupiter Trigger V2.
// The user's own wallet (any Wallet Standard wallet: Phantom, Solflare, Backpack…) signs every step; funds sit in the
// user's own Jupiter vault until the order fills or is cancelled. Our server only relays the calls (/api/exits).
const SOL = 'So11111111111111111111111111111111111111112';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const A58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function b58(bytes) {
  let n = 0n; for (const b of bytes) n = n * 256n + BigInt(b);
  let s = ''; while (n > 0n) { s = A58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b) break; s = '1' + s; }
  return s;
}
const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const toB64 = u => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const fmtUsd = p => (p == null ? '—' : '$' + (p >= 1 ? (+p).toLocaleString(undefined, { maximumFractionDigits: 4 }) : (+p).toPrecision(4)));

// ---------- Wallet Standard (no web3.js) ----------
const wallets = new Set();
const reg = w => { if (w?.features?.['standard:connect'] && w.features['solana:signTransaction'] && w.chains?.some(c => c.startsWith('solana:'))) wallets.add(w); };
let listening = false;
function discover() {
  if (!listening) {
    listening = true;
    window.addEventListener('wallet-standard:register-wallet', e => { try { e.detail({ register: (...ws) => { ws.forEach(reg); return () => {}; } }); } catch {} });
  }
  try { window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: { register: (...ws) => { ws.forEach(reg); return () => {}; } } })); } catch {}
  return [...wallets];
}

// ---------- session (memory only — tokens are never written to storage) ----------
let S = null; // { wallet, account, pubkey, accessToken, refreshToken, expiresAt }
async function call(path, { method = 'GET', body, authed = true } = {}) {
  if (authed && S && S.expiresAt && Date.now() > S.expiresAt - 60e3) await refresh();
  const headers = { 'content-type': 'application/json' };
  if (authed && S?.accessToken) headers.authorization = 'Bearer ' + S.accessToken;
  const r = await fetch('/api/exits' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && authed && S?.refreshToken && !call.retry) { call.retry = true; try { await refresh(); return await call(path, { method, body, authed }); } finally { call.retry = false; } }
  if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
  return j;
}
async function refresh() {
  const j = await call('/auth/refresh', { method: 'POST', body: { refreshToken: S.refreshToken }, authed: false }).catch(() => null);
  if (!j?.accessToken) { S = null; throw new Error('Session expired — connect again'); }
  Object.assign(S, { accessToken: j.accessToken, refreshToken: j.refreshToken || S.refreshToken, expiresAt: j.expiresAt ? +new Date(j.expiresAt) : Date.now() + 14 * 60e3 });
}
async function connect(wallet) {
  const { accounts } = await wallet.features['standard:connect'].connect();
  const account = accounts?.[0]; if (!account) throw new Error('No account selected');
  const pubkey = account.address;
  if (!wallet.features['solana:signMessage']) throw new Error(`${wallet.name} can't sign messages`);
  const { challenge } = await call('/auth/challenge', { method: 'POST', body: { walletPubkey: pubkey }, authed: false });
  const [out] = await wallet.features['solana:signMessage'].signMessage({ account, message: new TextEncoder().encode(challenge) });
  const t = await call('/auth/verify', { method: 'POST', body: { walletPubkey: pubkey, signature: b58(out.signature) }, authed: false });
  S = { wallet, account, pubkey, accessToken: t.accessToken || t.token, refreshToken: t.refreshToken, expiresAt: t.expiresAt ? +new Date(t.expiresAt) : Date.now() + 14 * 60e3 };
  await call('/vault');
  return S;
}
async function sign(...b64s) {
  const f = S.wallet.features['solana:signTransaction'];
  const inputs = b64s.map(t => ({ account: S.account, transaction: fromB64(t), chain: 'solana:mainnet' }));
  let out;
  try { out = await f.signTransaction(...inputs); } catch (e) { if (inputs.length < 2 || /reject|cancel|denied/i.test(e.message)) throw e; out = []; for (const i of inputs) out.push((await f.signTransaction(i))[0]); }
  return out.map(o => toB64(o.signedTransaction));
}

// ---------- UI ----------
const MODES = {
  tpsl: { label: '🎯 TP + SL', hint: 'Sell when price hits your take-profit OR your stop-loss — whichever comes first.' },
  limitSell: { label: '📈 Limit sell', hint: 'Sell when the price rises to your target.' },
  stop: { label: '🛑 Stop-loss', hint: 'Sell if the price falls to your stop.' },
  trail: { label: '〽️ Trailing stop', hint: 'Stop follows the price up and sells if it drops this far from the peak.' },
  limitBuy: { label: '🛒 Limit buy', hint: 'Buy with SOL when the price dips to your target.' },
};
export function card(sym) {
  return `<div class="card exitcard" id="exitCard"><div class="buy-head"><div><b>🎯 Exits: TP / SL &amp; limit orders</b><div class="dim">Set a take-profit, stop-loss, trailing stop or limit buy for ${esc(sym || 'this token')} — executes automatically via Jupiter, even when you're offline.</div></div><button class="btn" id="exitOpen">Set an exit</button></div><div id="exitBody" hidden></div></div>`;
}
export async function setup({ mint, symbol, priceUsd, jupUrl, cleanup }) {
  const box = $('#exitCard'); if (!box) return;
  let cfg; try { cfg = (await fetch('/api/config').then(r => r.json())).exits || {}; } catch { cfg = {}; }
  if (!cfg.enabled) { box.querySelector('.dim').innerHTML += ` <a href="${esc(jupUrl)}" target="_blank" rel="noopener" style="color:var(--b)">Set one on jup.ag ↗</a>`; $('#exitOpen').remove(); return; }
  const sym = esc(symbol || 'token');
  let mode = 'tpsl', price = priceUsd || null, alive = true;
  cleanup?.push(() => { alive = false; });
  const feeLine = cfg.feeBps ? `On the Scope fee: ${(cfg.feeBps / 100).toFixed(cfg.feeBps % 100 ? 2 : 1)}% of the order value, paid in SOL when you place it (not refunded if you cancel).` : '';
  const body = $('#exitBody');
  const render = () => {
    const sell = mode !== 'limitBuy', m = MODES[mode];
    body.innerHTML = `<div class="exmodes">${Object.entries(MODES).map(([k, v]) => `<button class="toggle ${k === mode ? 'on' : ''}" data-mode="${k}">${v.label}</button>`).join('')}</div>
      <p class="dim exhint">${m.hint} Now: <b>${fmtUsd(price)}</b></p>
      <form class="exform" id="exForm">
        <label>${sell ? `Amount (${sym})` : 'Spend (SOL)'}<span class="exbal" id="exBal"></span><input name="amount" inputmode="decimal" required placeholder="0.0"></label>
        ${mode === 'tpsl' ? `<label>Take-profit price (USD)<input name="tp" inputmode="decimal" required placeholder="${price ? +(price * 2).toPrecision(3) : ''}"></label><label>Stop-loss price (USD)<input name="sl" inputmode="decimal" required placeholder="${price ? +(price * 0.7).toPrecision(3) : ''}"></label>` : ''}
        ${mode === 'limitSell' || mode === 'stop' || mode === 'limitBuy' ? `<label>${mode === 'limitSell' ? 'Sell at' : mode === 'stop' ? 'Stop at' : 'Buy at'} price (USD)<input name="px" inputmode="decimal" required placeholder="${price ? +(price * (mode === 'limitSell' ? 2 : mode === 'stop' ? 0.7 : 0.8)).toPrecision(3) : ''}"></label>` : ''}
        ${mode === 'trail' ? '<label>Trail distance (%)<input name="trail" inputmode="decimal" required value="15"></label>' : ''}
        <label>Expires<select name="exp"><option value="1">1 day</option><option value="7" selected>7 days</option><option value="30">30 days</option></select></label>
        <label>Max slippage (%)<input name="slip" inputmode="decimal" placeholder="auto"></label>
        <button class="btn pri full" id="exGo">${S ? 'Place order' : 'Connect wallet & place order'}</button>
        <div class="full dim exnote">Minimum order $${cfg.minUsd || 10}. Funds move into your own Jupiter vault until the order fills, expires or you cancel (cancel returns them to your wallet). ${feeLine} Not financial advice.</div>
        <div class="full dn" id="exErr"></div>
      </form>
      <div id="exOrders"></div>`;
    body.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { mode = b.dataset.mode; render(); });
    $('#exForm').onsubmit = submit;
    loadBal(); loadOrders();
  };
  const pickWallet = async () => {
    let ws = discover(); if (!ws.length) { await new Promise(r => setTimeout(r, 400)); ws = discover(); }
    if (!ws.length) throw new Error('No Solana wallet found — install Phantom, Solflare or Backpack');
    if (ws.length === 1) return ws[0];
    return new Promise((res, rej) => {
      document.body.insertAdjacentHTML('beforeend', `<div class="modal-bg" id="wpick"><div class="modal" role="dialog" aria-modal="true"><div class="mhead"><h2>Choose a wallet</h2><button class="x" id="wpX" aria-label="Close">✕</button></div><div class="wlist">${ws.map((w, i) => `<button class="btn" data-w="${i}">${w.icon ? `<img src="${esc(w.icon)}" width="20" height="20" alt="">` : ''} ${esc(w.name)}</button>`).join('')}</div></div></div>`);
      const close = () => $('#wpick')?.remove();
      $('#wpX').onclick = () => { close(); rej(new Error('No wallet selected')); };
      document.querySelectorAll('#wpick [data-w]').forEach(b => b.onclick = () => { close(); res(ws[+b.dataset.w]); });
    });
  };
  async function ensure() { if (!S) { await connect(await pickWallet()); } return S; }
  async function loadBal() {
    if (!S) return; const sell = mode !== 'limitBuy';
    try {
      const b = await call(`/balance?owner=${S.pubkey}&mint=${sell ? mint : SOL}`);
      const el = $('#exBal'); if (!el || !alive) return;
      el.innerHTML = ` · bal ${(+b.ui).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${[25, 50, 100].map(p => `<a href="#" data-pct="${p}">${p}%</a>`).join(' ')}`;
      el.querySelectorAll('[data-pct]').forEach(a => a.onclick = e => { e.preventDefault(); const v = b.ui * +a.dataset.pct / 100 * (sell ? 1 : 0.97); $('#exForm').amount.value = String(+v.toFixed(Math.min(9, b.decimals ?? 6))); });
    } catch {}
  }
  async function loadOrders() {
    const el = $('#exOrders'); if (!el || !S) return;
    try {
      const j = await call(`/orders?state=active&mint=${mint}`);
      const os = (j.orders || []).filter(o => o.inputMint === mint || o.outputMint === mint);
      if (!alive || !$('#exOrders')) return;
      el.innerHTML = os.length ? `<h4>Your open orders</h4><div class="exlist">${os.map(o => {
        const what = o.orderType === 'oco' ? `TP ${fmtUsd(o.tpPriceUsd)} / SL ${fmtUsd(o.slPriceUsd)}` : o.trailingBps ? `Trailing ${(o.trailingBps / 100).toFixed(1)}%${o.triggerPriceUsd ? ' · now ' + fmtUsd(o.triggerPriceUsd) : ''}` : `${o.triggerCondition === 'above' ? '≥' : '≤'} ${fmtUsd(o.triggerPriceUsd)}`;
        const side = o.inputMint === SOL ? 'Buy' : 'Sell';
        return `<div class="exrow"><span><b>${side}</b> ${esc(what)} <span class="dim">· ${esc(o.orderState)}${o.expiresAt ? ' · until ' + new Date(o.expiresAt).toLocaleDateString() : ''}</span></span><button class="btn" data-cancel="${esc(o.id)}">${o.orderState === 'expired' ? 'Withdraw' : 'Cancel'}</button></div>`;
      }).join('')}</div>` : '';
      el.querySelectorAll('[data-cancel]').forEach(b => b.onclick = () => cancel(b.dataset.cancel, b));
    } catch (e) { el.innerHTML = `<div class="dim">${esc(e.message)}</div>`; }
  }
  async function cancel(id, btn) {
    btn.disabled = true; btn.textContent = 'Cancelling…';
    try {
      const c = await call(`/orders/${id}/cancel`, { method: 'POST' });
      const [signed] = await sign(c.transaction);
      await call(`/orders/${id}/confirm-cancel`, { method: 'POST', body: { signedTransaction: signed, cancelRequestId: c.requestId } });
      window.toast?.('✓ Order cancelled — funds returned to your wallet'); loadOrders(); loadBal();
    } catch (e) { btn.disabled = false; btn.textContent = 'Cancel'; const er = $('#exErr'); if (er) er.textContent = e.message; }
  }
  async function submit(e) {
    e.preventDefault();
    const f = e.target, btn = $('#exGo'), err = $('#exErr'); err.textContent = '';
    const n = k => { const v = String(f[k]?.value || '').trim().replace(',', '.'); return v === '' ? null : +v; };
    const sell = mode !== 'limitBuy';
    try {
      const amount = String(f.amount.value).trim().replace(',', '.');
      if (!(+amount > 0)) throw new Error('Enter an amount');
      const slip = n('slip'); if (slip != null && !(slip >= 0 && slip <= 100)) throw new Error('Slippage must be 0–100%');
      const o = { orderType: mode === 'tpsl' ? 'oco' : 'single', inputMint: sell ? mint : SOL, outputMint: sell ? SOL : mint, triggerMint: mint, expiresAt: Date.now() + +f.exp.value * 864e5 };
      if (mode === 'tpsl') {
        o.tpPriceUsd = n('tp'); o.slPriceUsd = n('sl');
        if (!(o.tpPriceUsd > o.slPriceUsd && o.slPriceUsd > 0)) throw new Error('Take-profit must be above stop-loss');
        if (price && (o.tpPriceUsd <= price || o.slPriceUsd >= price)) throw new Error(`Take-profit must be above and stop-loss below the current price (${fmtUsd(price)})`);
        if (slip != null) o.tpSlippageBps = o.slSlippageBps = Math.round(slip * 100);
      } else if (mode === 'trail') {
        const t = n('trail'); if (!(t >= 0.5 && t <= 90)) throw new Error('Trail must be 0.5–90%');
        Object.assign(o, { triggerCondition: 'below', trailingBps: Math.round(t * 100) });
      } else {
        o.triggerPriceUsd = n('px'); if (!(o.triggerPriceUsd > 0)) throw new Error('Enter a trigger price');
        o.triggerCondition = mode === 'limitSell' ? 'above' : 'below';
        if (price && mode === 'limitSell' && o.triggerPriceUsd <= price) throw new Error('A limit sell price must be above the current price');
        if (price && mode !== 'limitSell' && o.triggerPriceUsd >= price) throw new Error('This price must be below the current price');
      }
      if (slip != null && mode !== 'tpsl') o.slippageBps = Math.round(slip * 100);
      btn.disabled = true; btn.textContent = 'Connecting wallet…';
      await ensure();
      btn.textContent = 'Preparing deposit…';
      const d = await call('/deposit', { method: 'POST', body: { inputMint: o.inputMint, outputMint: o.outputMint, userAddress: S.pubkey, uiAmount: amount, orderSubType: o.orderType } });
      const feeTxt = d.fee?.lamports ? ` + ${(d.fee.lamports / 1e9).toFixed(6)} SOL fee${d.fee.usd != null ? ` (≈$${d.fee.usd})` : ''}` : '';
      btn.textContent = 'Approve in wallet' + feeTxt + '…';
      const signed = await sign(...[d.transaction, d.fee?.transaction].filter(Boolean));
      btn.textContent = 'Placing order…';
      const r = await call('/orders', { method: 'POST', body: { ...o, depositRequestId: d.requestId, depositSignedTx: signed[0], feeSignedTx: signed[1], userPubkey: S.pubkey, inputAmount: d.amount } });
      window.toast?.(`✓ Order placed for ${sym}${r.txSignature ? ` · <a href="https://solscan.io/tx/${esc(r.txSignature)}" target="_blank" rel="noopener" style="color:var(--b)">view tx</a>` : ''}`);
      f.amount.value = ''; loadOrders(); loadBal();
    } catch (x) { err.textContent = x.message || String(x); }
    finally { if (btn.isConnected) { btn.disabled = false; btn.textContent = S ? 'Place order' : 'Connect wallet & place order'; } }
  }
  $('#exitOpen').onclick = () => { $('#exitOpen').remove(); body.hidden = false; render(); };
}
