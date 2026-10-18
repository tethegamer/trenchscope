// On the Scope Profile: watchlist, tracked wallets, wallet PnL estimator and shareable PnL card.
// Everything is stored in localStorage; no wallet connection or signing. Loaded lazily from app.js.
let C; // helpers from app.js: { $, esc, usd, price, pct, age, short, icon, api, LS, toast, watch, toggleWatch, go, cleanup, tokenHref }
const TOKEN_PROGRAMS = ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'];
const isAddr = s => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s || '');
const sleep = (ms, signal) => new Promise((res, rej) => { const t = setTimeout(res, ms); signal?.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('aborted', 'AbortError')); }, { once: true }); });
const loadCore = () => window.PnlCore ? Promise.resolve() : new Promise((res, rej) => { const s = document.createElement('script'); s.src = '/pnl-core.js'; s.onload = res; s.onerror = () => rej(new Error('failed to load PnL engine')); document.head.append(s); });
const hue = a => [...a].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const money = (n, sign = true) => n == null || isNaN(n) ? '—' : (sign ? (n > 0 ? '+' : n < 0 ? '−' : '') : (n < 0 ? '−' : '')) + C.usd(Math.abs(n), Math.abs(n) < 1 ? 2 : undefined);
const cls = n => n > 0 ? 'up' : n < 0 ? 'dn' : 'mut';
const qty = n => Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 }).format(n);

// ---------- Solana RPC ----------
// The browser reads chain data itself (so rate limits are per user, not per server): user's own RPC if set ->
// PublicNode (free, CORS-enabled) -> our server proxy (Solana public RPC). Methods an endpoint refuses are
// remembered for the session and skipped; 429s back off and retry.
const BROWSER_RPC = 'https://solana-rpc.publicnode.com';
const bad = {};
const endpoints = () => [C.LS.get('rpc', ''), BROWSER_RPC, '/api/rpc'].filter(Boolean);
async function rpcOne(method, params, signal) {
  let limited = false;
  for (const ep of endpoints()) {
    const k = ep + '|' + method; if (bad[k]) continue;
    try {
      const r = await fetch(ep, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal });
      if (r.status === 429) { limited = true; continue; }
      const j = await r.json().catch(() => null);
      if (j && j.error) {
        const msg = String(j.error.message || j.error);
        if (j.error.code === 429 || /too many|rate.?limit/i.test(msg)) { limited = true; continue; }
        if (r.status >= 400 || /blocked|forbidden|not available|unsupported|batch/i.test(msg)) { bad[k] = 1; continue; }
        return { error: msg };
      }
      if (!r.ok || !j) { if ([401, 403, 404, 405].includes(r.status)) bad[k] = 1; continue; }
      return { result: j.result };
    } catch (e) { if (e.name === 'AbortError') throw e; bad[k] = 1; }
  }
  return limited ? { rl: true } : { error: 'No Solana RPC reachable right now — try again shortly.' };
}
async function rpc1(method, params, signal, tries = 5) {
  for (let i = 0; i < tries; i++) {
    const x = await rpcOne(method, params, signal);
    if (x.result !== undefined) return x.result;
    if (x.error) throw new Error(x.error);
    await sleep(1200 * (i + 1), signal);
  }
  throw new Error('Solana RPCs are rate-limiting right now — wait a minute and retry (or set your own RPC in settings).');
}
async function signatures(addr, limit, signal) {
  const out = []; let before;
  while (out.length < limit) {
    const want = Math.min(1000, limit - out.length);
    const page = await rpc1('getSignaturesForAddress', [addr, { limit: want, ...(before ? { before } : {}) }], signal);
    out.push(...page); if (page.length < want) break; before = page[page.length - 1].signature;
  }
  return out.slice(0, limit);
}
// Fetch parsed transactions with a small worker pool, backing off on 429s. Returns Map(sig -> compact delta).
async function fetchTxs(addr, sigs, { onProgress, signal } = {}) {
  const got = new Map(); const queue = sigs.slice(); let streak = 0; let giveUp = false;
  const worker = async () => {
    while (queue.length && !signal?.aborted && !giveUp) {
      const s = queue.shift(); let x;
      try { x = await rpcOne('getTransaction', [s, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }], signal); }
      catch (e) { if (e.name === 'AbortError') return; x = { rl: true }; }
      if (x.rl) {
        queue.push(s); streak++; if (streak > 60) { giveUp = true; return; } // partial results beat an endless spinner
        onProgress?.(got.size, sigs.length, true, got);
        try { await sleep(Math.min(8000, 400 * streak), signal); } catch { return; }
        continue;
      }
      streak = Math.max(0, streak - 2);
      got.set(s, x.result ? PnlCore.parseTx(x.result, addr, s) : { s, t: 0, x: 1 });
      onProgress?.(got.size, sigs.length, false, got);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return got;
}

// ---------- per-wallet tx cache (localStorage, LRU) so re-runs only fetch new transactions ----------
const cacheKey = a => 'pnlc:' + a;
const cacheGet = a => C.LS.get(cacheKey(a), null) || {};
function cachePut(a, raws) {
  const idx = C.LS.get('pnlIdx', []).filter(x => x !== a); idx.unshift(a);
  const entries = Object.entries(raws).sort((x, y) => (y[1].t || 0) - (x[1].t || 0)).slice(0, 1500);
  const slim = Object.fromEntries(entries.map(([s, r]) => [s, r.x ? { t: r.t, x: 1 } : { t: r.t, sol: r.sol, usd: r.usd, tk: r.tk }]));
  for (let i = 0; i < 4; i++) {
    try { C.LS.set(cacheKey(a), slim); break; } catch { const drop = idx.pop(); if (!drop || drop === a) break; localStorage.removeItem('ts:' + cacheKey(drop)); }
  }
  for (const old of idx.splice(8)) localStorage.removeItem('ts:' + cacheKey(old));
  C.LS.set('pnlIdx', idx);
}
let solPx = null;
const solPrice = async () => solPx && Date.now() - solPx.at < 15 * 60e3 ? solPx.fn : (solPx = { at: Date.now(), fn: PnlCore.solPriceFn(await C.api('/api/solprice')) }).fn;
async function tokenMeta(mints) {
  const out = {}; const list = [...new Set(mints)];
  for (let i = 0; i < list.length; i += 60) {
    try { Object.assign(out, (await C.api('/api/prices?mints=' + list.slice(i, i + 60).join(','))).prices); } catch {}
  }
  return out;
}
async function balancesOf(addr, signal) {
  const safe = pr => pr.catch(e => { if (e.name === 'AbortError') throw e; return { error: e.message }; });
  const [a, b, sol] = await Promise.all([
    safe(rpcOne('getTokenAccountsByOwner', [addr, { programId: TOKEN_PROGRAMS[0] }, { encoding: 'jsonParsed' }], signal)),
    safe(rpcOne('getTokenAccountsByOwner', [addr, { programId: TOKEN_PROGRAMS[1] }, { encoding: 'jsonParsed' }], signal)),
    safe(rpcOne('getBalance', [addr], signal)),
  ]).catch(() => [{}, {}, {}]);
  let bal = null;
  if (a.result) {
    bal = {};
    for (const r of [a, b]) for (const v of r.result?.value || []) { const i = v.account?.data?.parsed?.info; if (i) bal[i.mint] = (bal[i.mint] || 0) + (+i.tokenAmount?.uiAmount || 0); }
  }
  return { balances: bal, sol: sol.result ? sol.result.value / 1e9 : null };
}
// Full analysis. Returns { addr, pnl, events, meta, sigCount, fetched, partial, sol }.
async function analyze(addr, depth, { onProgress, signal, withBalances = true } = {}) {
  await loadCore();
  const [sigs, px, bal] = await Promise.all([signatures(addr, depth, signal), solPrice().catch(() => () => null), withBalances ? balancesOf(addr, signal) : Promise.resolve({})]);
  const raws = cacheGet(addr);
  for (const s of sigs) if (s.err && !raws[s.signature]) raws[s.signature] = { t: (s.blockTime || 0) * 1000, x: 1 };
  const need = sigs.filter(s => !raws[s.signature]).map(s => s.signature);
  let lastSave = Date.now();
  const got = need.length ? await fetchTxs(addr, need, { signal, onProgress: (n, total, stalled, m) => {
    onProgress?.(sigs.length - need.length + n, sigs.length, stalled);
    if (Date.now() - lastSave > 4000) { lastSave = Date.now(); for (const [s, r] of m) raws[s] = r; cachePut(addr, raws); }
  } }) : new Map();
  for (const [s, r] of got) raws[s] = r;
  cachePut(addr, raws);
  const inWindow = sigs.map(s => raws[s.signature] && { ...raws[s.signature], s: s.signature, t: raws[s.signature].t || (s.blockTime || 0) * 1000 }).filter(Boolean);
  const events = inWindow.filter(r => !r.x).map(r => PnlCore.classify(r, px)).filter(Boolean);
  const meta = await tokenMeta(events.flatMap(e => e.from ? [e.mint, e.from] : [e.mint]));
  const prices = Object.fromEntries(Object.entries(meta).filter(([, v]) => v.priceUsd != null).map(([m, v]) => [m, v.priceUsd]));
  const pnl = PnlCore.computePnl(events, { prices, balances: bal.balances || null });
  return { addr, pnl, events: events.sort((a, b) => b.t - a.t), meta, sigCount: sigs.length, fetched: inWindow.length, partial: inWindow.length < sigs.length, sol: bal.sol ?? null, at: Date.now() };
}

// ---------- page ----------
const TABS = [['watch', '★ Watchlist'], ['wallets', '👛 Wallets'], ['pnl', '📈 PnL']];
let pfClean = [];
const onLeave = f => pfClean.push(f);
export function profilePage(ctx) {
  pfClean.forEach(f => f()); pfClean = [];
  if (C !== ctx) { C = ctx; ctx.cleanup.push(() => { pfClean.forEach(f => f()); pfClean = []; }); }
  const { $, esc, LS } = C;
  document.title = 'Profile — On the Scope';
  const q = new URLSearchParams(location.search);
  let tab = q.get('tab') || LS.get('pfTab', 'watch'); if (!TABS.some(t => t[0] === tab)) tab = 'watch';
  const prof = LS.get('profile', { name: '' });
  const name = prof.name || 'Anon trencher';
  const wallets = LS.get('wallets', []);
  C.app.innerHTML = `
  <section class="pf-head">
    <div class="pf-av" style="--h:${hue(name)}">${esc(name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() || 'TS')}</div>
    <div class="pf-id"><div class="pf-name"><span id="pfName">${esc(name)}</span><button class="pf-edit" id="pfEdit" title="Edit display name" aria-label="Edit display name">✎</button></div>
      <div class="mut pf-sub">Stored only in this browser · no wallet connection, no signing</div></div>
    <button class="btn xbtn" disabled title="Connect X — coming soon"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.77L17.75 3Zm-1.08 16.17h1.7L7.4 4.74H5.58l11.09 14.43Z"/></svg> Connect X <span class="soon">Coming soon</span></button>
  </section>
  <div class="pf-stats"><div><b>${Object.keys(C.watch).length}</b><small>Watching</small></div><div><b>${wallets.length}</b><small>Wallets</small></div><div><b>${LS.get('alerts', []).length}</b><small>Alerts</small></div><div><b id="pfLast">${LS.get('lastPnl', null) ? money(LS.get('lastPnl').total) : '—'}</b><small>Last PnL</small></div></div>
  <nav class="tabs pf-tabs">${TABS.map(([id, l]) => `<button class="tab ${id === tab ? 'on' : ''}" data-ptab="${id}">${l}${id === 'watch' ? ` <span class="chip">${Object.keys(C.watch).length}</span>` : id === 'wallets' ? ` <span class="chip">${wallets.length}</span>` : ''}</button>`).join('')}</nav>
  <div id="pfBody"></div>`;
  C.app.querySelectorAll('[data-ptab]').forEach(b => b.onclick = () => { LS.set('pfTab', b.dataset.ptab); history.replaceState(null, '', '/profile?tab=' + b.dataset.ptab); profilePage(C); });
  $('#pfEdit').onclick = () => {
    const el = $('#pfName'); el.innerHTML = `<input id="pfNameIn" maxlength="24" value="${esc(prof.name)}" placeholder="Anon trencher">`;
    const inp = $('#pfNameIn'); inp.focus(); inp.select();
    const save = () => { LS.set('profile', { ...prof, name: inp.value.trim().slice(0, 24) }); profilePage(C); };
    inp.onkeydown = e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') profilePage(C); }; inp.onblur = save;
  };
  ({ watch: watchTab, wallets: walletsTab, pnl: pnlTab })[tab]();
}

// ---------- watchlist ----------
function watchTab() {
  const { $, esc } = C; const body = $('#pfBody');
  const mints = Object.keys(C.watch);
  if (!mints.length) { body.innerHTML = `<div class="card empty pf-empty"><div style="font-size:28px">☆</div><b>No tokens yet</b><p class="mut">Tap ☆ on any token in the screener and it shows up here, synced with the Watchlist tab.</p><a class="btn pri" href="/" data-link>Browse the screener</a></div>`; return; }
  const draw = (prices = {}) => {
    body.innerHTML = `<div class="pf-list">${mints.map(m => { const w = C.watch[m] || {}; const p = prices[m] || {};
      return `<div class="pf-row" data-h="/token/${m}">${C.icon({ icon: p.icon || w.icon, symbol: w.symbol || p.symbol })}
        <div class="nm"><b>${esc(w.symbol || p.symbol || C.short(m))}</b><span class="dim mono">${esc(C.short(m))}</span></div>
        <div class="r"><b class="mono">${p.priceUsd != null ? C.price(p.priceUsd) : '<span class="skel" style="width:60px"></span>'}</b><span>${C.pct(p.change?.h24)}</span></div>
        <div class="r hide-s"><small class="dim">MCap</small><span>${C.usd(p.mcap)}</span></div>
        <button class="x" data-unw="${m}" title="Remove from watchlist" aria-label="Remove">✕</button></div>`; }).join('')}</div>
      <p class="dim pf-foot">Live prices from DexScreener · refreshes every 30s · same list as the screener's ★ Watchlist tab.</p>`;
    body.querySelectorAll('.pf-row').forEach(r => r.onclick = e => { const x = e.target.closest('[data-unw]'); if (x) { const m = x.dataset.unw; C.toggleWatch({ mint: m, symbol: (C.watch[m] || {}).symbol || C.short(m) }); profilePage(C); return; } C.go(r.dataset.h); });
  };
  draw();
  const load = () => C.api('/api/prices?mints=' + mints.slice(0, 60).join(',')).then(d => $('#pfBody') && draw(d.prices)).catch(() => {});
  load(); const iv = setInterval(load, 30000); onLeave(() => clearInterval(iv));
}

// ---------- tracked wallets ----------
function walletsTab() {
  const { $, esc, LS } = C; const body = $('#pfBody');
  let wallets = LS.get('wallets', []);
  const act = LS.get('wact', {});
  body.innerHTML = `
  <form class="card pf-add" id="wAdd" autocomplete="off">
    <input id="wAddr" class="mono" placeholder="Paste a Solana wallet address" spellcheck="false" required>
    <input id="wLabel" placeholder="Label (e.g. Smart money #1)" maxlength="32">
    <button class="btn pri">+ Track wallet</button>
    <div id="wErr" class="dn pf-err"></div>
  </form>
  <div class="pf-list" id="wList">${wallets.length ? wallets.map(w => { const a = act[w.addr] || {};
    return `<div class="wrow" data-a="${esc(w.addr)}"><div class="wtop">
      <div class="wav" style="--h:${hue(w.addr)}">${esc((w.label || w.addr).slice(0, 2).toUpperCase())}</div>
      <div class="nm"><b>${esc(w.label || 'Wallet')}</b><span class="dim mono">${esc(C.short(w.addr))} <button class="copy" data-copyw="${esc(w.addr)}">Copy</button></span></div>
      <div class="r wmeta"><b class="mono" data-sol>${a.sol != null ? '◎ ' + a.sol.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '<span class="skel" style="width:50px"></span>'}</b><span class="dim" data-last>${a.last ? 'active ' + C.age(a.last) + ' ago' : '…'}</span></div></div>
      <div class="wbtns"><button class="btn sm" data-actv>Recent activity ▾</button><a class="btn sm" href="/profile?tab=pnl&w=${esc(w.addr)}" data-link>📈 PnL</a><a class="btn sm" href="https://solscan.io/account/${esc(w.addr)}" target="_blank" rel="noopener">Solscan ↗</a><button class="btn sm x" data-delw title="Stop tracking">✕</button></div>
      <div class="wact" hidden></div></div>`; }).join('') : `<div class="card empty pf-empty"><div style="font-size:28px">👛</div><b>Track any wallet</b><p class="mut">Paste a Solana address (a KOL, a dev, your own) to see its latest buys and sells and its estimated PnL. No connection or signing — read-only public data.</p></div>`}</div>`;
  $('#wAdd').onsubmit = e => {
    e.preventDefault(); const addr = $('#wAddr').value.trim(); const label = $('#wLabel').value.trim();
    if (!isAddr(addr)) { $('#wErr').textContent = 'That doesn\'t look like a Solana address (base58, 32–44 chars).'; return; }
    if (wallets.some(w => w.addr === addr)) { $('#wErr').textContent = 'Already tracking this wallet.'; return; }
    wallets = [{ addr, label: label || 'Wallet ' + (wallets.length + 1), addedAt: Date.now() }, ...wallets].slice(0, 50);
    LS.set('wallets', wallets); C.toast(`👛 Tracking ${esc(label || C.short(addr))}`); profilePage(C);
  };
  body.querySelectorAll('[data-copyw]').forEach(b => b.onclick = () => { navigator.clipboard?.writeText(b.dataset.copyw); b.textContent = 'Copied ✓'; setTimeout(() => (b.textContent = 'Copy'), 1400); });
  body.querySelectorAll('.wrow').forEach(row => {
    const addr = row.dataset.a;
    row.querySelector('[data-delw]').onclick = () => { LS.set('wallets', LS.get('wallets', []).filter(w => w.addr !== addr)); profilePage(C); };
    row.querySelector('[data-actv]').onclick = e => toggleActivity(row, addr, e.currentTarget);
  });
  // refresh balance + last activity, one wallet at a time (stays under public RPC limits)
  const ctl = new AbortController(); onLeave(() => ctl.abort());
  (async () => {
    for (const w of wallets) {
      if (ctl.signal.aborted) return;
      const prev = act[w.addr]; if (prev && Date.now() - prev.at < 60e3) continue;
      try {
        const [s, b] = await Promise.all([rpcOne('getSignaturesForAddress', [w.addr, { limit: 1 }], ctl.signal), rpcOne('getBalance', [w.addr], ctl.signal)]);
        const cur = { ...prev, at: Date.now() };
        if (s.result) cur.last = (s.result[0]?.blockTime || 0) * 1000 || null; if (b.result) cur.sol = b.result.value / 1e9;
        act[w.addr] = cur; LS.set('wact', act);
        const row = body.querySelector(`.wrow[data-a="${w.addr}"]`); if (!row) return;
        if (cur.sol != null) row.querySelector('[data-sol]').textContent = '◎ ' + cur.sol.toLocaleString(undefined, { maximumFractionDigits: 2 });
        row.querySelector('[data-last]').textContent = cur.last ? 'active ' + C.age(cur.last) + ' ago' : (s.rl ? 'rate-limited, retry soon' : 'no activity');
      } catch (e) { if (e.name === 'AbortError') return; }
      await sleep(250, ctl.signal).catch(() => {});
    }
  })();
}
async function toggleActivity(row, addr, btn) {
  const box = row.querySelector('.wact');
  if (!box.hidden) { box.hidden = true; btn.textContent = 'Recent activity ▾'; return; }
  box.hidden = false; btn.textContent = 'Hide activity ▴';
  box.innerHTML = `<div class="mut pf-load"><span class="spin"></span> Loading the last 25 transactions…</div>`;
  const ctl = new AbortController(); onLeave(() => ctl.abort());
  try {
    const r = await analyze(addr, 25, { signal: ctl.signal, withBalances: false, onProgress: (n, t, stalled) => { box.querySelector('.pf-load') && (box.querySelector('.pf-load').innerHTML = `<span class="spin"></span> ${stalled ? 'RPC busy, backing off…' : 'Reading transactions'} ${n}/${t}`); } });
    box.innerHTML = activityList(r.events.slice(0, 25), r.meta) + (r.partial ? `<div class="dim pf-foot">Some transactions were skipped (RPC rate limit) — open again to retry.</div>` : '');
  } catch (e) { if (e.name !== 'AbortError') box.innerHTML = `<div class="err">${C.esc(e.message)}</div>`; }
}
function activityList(evs, meta) {
  const { esc } = C;
  if (!evs.length) return '<div class="mut pf-load">No token buys/sells in the latest transactions.</div>';
  const sym = m => esc(meta[m]?.symbol || C.short(m));
  const label = { buy: 'Buy', sell: 'Sell', in: 'Received', out: 'Sent', swap: 'Swap' };
  return `<div class="alist">${evs.map(e => `<a class="aitem" href="/token/${e.mint}" data-link>
    <span class="k ${e.kind === 'buy' || e.kind === 'in' ? 'up' : e.kind === 'swap' ? 'mut' : 'dn'}">${label[e.kind]}</span>
    <span class="t">${C.icon({ icon: meta[e.mint]?.icon, symbol: meta[e.mint]?.symbol || '?' }, 'ico sm')}<b>${sym(e.mint)}</b><span class="dim mono">${qty(e.qty)}${e.kind === 'swap' ? ' ← ' + qty(e.fromQty) + ' ' + sym(e.from) : ''}</span></span>
    <span class="v mono">${e.usd ? C.usd(e.usd, 2) : ''}</span><span class="dim a">${C.age(e.t)}</span></a>`).join('')}</div>`;
}

// ---------- PnL ----------
let lastResult = null;
function pnlTab() {
  const { $, esc, LS } = C; const body = $('#pfBody');
  const wallets = LS.get('wallets', []);
  const pre = new URLSearchParams(location.search).get('w') || LS.get('pnlAddr', '');
  const depth = LS.get('pnlDepth', 250);
  body.innerHTML = `
  <div class="card pf-pnlform">
    <form id="pnlForm" autocomplete="off"><input id="pnlAddr" class="mono" placeholder="Paste a Solana wallet address" value="${esc(pre)}" spellcheck="false" required>
      <select id="pnlDepth" title="How many recent transactions to scan">${[[100, 'Last 100 txs · fastest'], [250, 'Last 250 txs'], [500, 'Last 500 txs'], [1000, 'Last 1,000 txs · slower']].map(([v, t]) => `<option value="${v}" ${v === depth ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <button class="btn pri" id="pnlGo">Analyze</button></form>
    ${wallets.length ? `<div class="pf-chips">${wallets.slice(0, 8).map(w => `<button class="chip" data-usew="${esc(w.addr)}">${esc(w.label)}</button>`).join('')}</div>` : ''}
    <details class="pf-set"><summary>Settings · custom RPC</summary><div class="pf-setrow"><input id="rpcUrl" class="mono" placeholder="https://… (default: PublicNode + Solana public RPC)" value="${esc(LS.get('rpc', ''))}"><button class="btn sm" id="rpcSave">Save</button></div>
      <p class="dim">Optional. By default your browser reads the chain through free public RPCs (PublicNode, then the Solana public RPC via On the Scope). If they get busy, paste your own RPC URL (e.g. a free Helius or QuickNode key) — stored only in this browser.</p></details>
  </div>
  <div id="pnlOut">${lastResult && lastResult.addr === pre ? '' : `<div class="card empty pf-empty"><div style="font-size:28px">📈</div><b>Wallet PnL, estimated</b><p class="mut">Paste any Solana address to estimate realized &amp; unrealized PnL, volume and daily / weekly / monthly profit from its recent on-chain trades — then grab a shareable PnL card.</p></div>`}</div>`;
  body.querySelectorAll('[data-usew]').forEach(b => b.onclick = () => { $('#pnlAddr').value = b.dataset.usew; $('#pnlForm').requestSubmit(); });
  $('#rpcSave').onclick = () => { const v = $('#rpcUrl').value.trim(); if (v && !/^https:\/\//.test(v)) return C.toast('RPC URL must start with https://'); LS.set('rpc', v); for (const k in bad) delete bad[k]; C.toast(v ? 'Custom RPC saved' : 'Using the public RPC'); };
  let ctl = null; onLeave(() => ctl?.abort());
  $('#pnlForm').onsubmit = async e => {
    e.preventDefault();
    const addr = $('#pnlAddr').value.trim(); const dep = +$('#pnlDepth').value;
    if (!isAddr(addr)) { $('#pnlOut').innerHTML = `<div class="err">Enter a valid Solana wallet address.</div>`; return; }
    LS.set('pnlAddr', addr); LS.set('pnlDepth', dep); history.replaceState(null, '', '/profile?tab=pnl&w=' + addr);
    ctl?.abort(); ctl = new AbortController(); const my = ctl;
    const cachedN = Object.keys(cacheGet(addr)).length;
    $('#pnlOut').innerHTML = `<div class="card pf-prog"><div class="pf-progtop"><span class="spin"></span><b id="pgT">Fetching signatures…</b><button class="btn sm" id="pgStop">Stop &amp; show results</button></div><div class="bar2"><i id="pgBar" style="width:3%"></i></div>
      <p class="dim" id="pgSub">${cachedN ? `${cachedN} transactions already cached in this browser — only new ones are fetched.` : 'Reading transactions from free public Solana RPCs. Results are cached in this browser so the next run is near-instant.'}</p></div>`;
    $('#pgStop').onclick = () => { my.abort(); $('#pgT').textContent = 'Crunching what we have…'; };
    const t0 = Date.now();
    try {
      const r = await analyze(addr, dep, { signal: my.signal, onProgress: (n, t, stalled) => {
        const b = $('#pgBar'); if (!b) return; b.style.width = Math.max(3, n / t * 100).toFixed(1) + '%';
        $('#pgT').textContent = `Reading transactions ${n}/${t}`;
        const left = Math.max(0, (t - n) / Math.max(0.5, n / ((Date.now() - t0) / 1000)));
        $('#pgSub').textContent = stalled ? 'RPC rate limit hit — backing off automatically…' : `~${Math.ceil(left)}s left · cached for next time`;
      } });
      if (my !== ctl) return;
      showResult(r);
    } catch (err) {
      if (my !== ctl) return;
      // (stopping during the transaction phase returns partial results; only an early stop lands here)
      if (err.name === 'AbortError') { $('#pnlOut').innerHTML = `<div class="mut card">Stopped before any transactions were read.</div>`; return; }
      $('#pnlOut').innerHTML = `<div class="err">${esc(err.message)}</div>`;
    }
  };
  if (pre && lastResult?.addr === pre) showResult(lastResult); else if (pre && new URLSearchParams(location.search).get('w')) $('#pnlForm').requestSubmit();
}
function showResult(r) {
  const { $, esc, LS } = C; lastResult = r; const p = r.pnl;
  const label = (LS.get('wallets', []).find(w => w.addr === r.addr) || {}).label;
  LS.set('lastPnl', { addr: r.addr, total: p.total, at: Date.now() }); const pl = $('#pfLast'); if (pl) { pl.textContent = money(p.total); }
  const maxAbs = Math.max(1e-9, ...p.days.map(d => Math.abs(d.pnl)));
  const range = p.from ? `${new Date(p.from).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} → ${new Date(p.to).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : '';
  const per = (k, l) => `<div class="kpi"><small>${l}</small><b class="${cls(p.periods[k].realized)}">${money(p.periods[k].realized)}</b><span class="dim" style="font-size:12px">Vol ${C.usd(p.periods[k].volume)} · ${p.periods[k].trades} trades</span></div>`;
  $('#pnlOut').innerHTML = `
  <div class="card pnl-hero">
    <div class="ph-l"><div class="mut ph-w"><span class="wav sm" style="--h:${hue(r.addr)}"></span>${esc(label || 'Wallet')} · <span class="mono">${esc(C.short(r.addr))}</span>${r.sol != null ? ` · ◎ ${r.sol.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : ''}</div>
      <small class="dim">ESTIMATED TOTAL PnL <span class="est" title="Estimate — see note below">estimate</span></small>
      <b class="ph-big ${cls(p.total)}">${money(p.total)}</b>
      <div class="ph-sub">${p.roi != null ? `<span class="pill ${cls(p.roi)}">${p.roi >= 0 ? '+' : ''}${(p.roi * 100).toFixed(1)}% ROI</span>` : ''}<span class="dim">${p.trades} trades · ${p.tokens.length} tokens · ${range}</span></div></div>
    <div class="ph-r"><button class="btn pri" id="cardBtn">🖼 PnL card</button><a class="btn" href="https://solscan.io/account/${esc(r.addr)}" target="_blank" rel="noopener">Solscan ↗</a></div>
  </div>
  <div class="kpis">
    <div class="kpi"><small>Realized</small><b class="${cls(p.realized)}">${money(p.realized)}</b><span class="dim" style="font-size:12px">closed positions</span></div>
    <div class="kpi"><small>Unrealized</small><b class="${cls(p.unrealized)}">${money(p.unrealized)}</b><span class="dim" style="font-size:12px">open: ${C.usd(p.openValue)}</span></div>
    <div class="kpi"><small>Volume</small><b>${C.usd(p.volume)}</b><span class="dim" style="font-size:12px">bought ${C.usd(p.invested)}</span></div>
    <div class="kpi"><small>Win rate</small><b>${p.winRate != null ? (p.winRate * 100).toFixed(0) + '%' : '—'}</b><span class="dim" style="font-size:12px">${p.wins}/${p.closed} tokens sold in profit</span></div>
  </div>
  <h3 class="pf-h">Realized profit by period</h3>
  <div class="kpis k3">${per('d1', 'Today · 24h')}${per('d7', 'This week · 7d')}${per('d30', 'This month · 30d')}</div>
  <div class="card"><h3>Daily realized PnL <span class="r">last 30 days</span></h3>
    <div class="dbars">${p.days.map(d => `<div class="db" title="${d.day}: ${money(d.pnl).replace('−', '-')}"><i class="${d.pnl >= 0 ? 'p' : 'n'}" style="height:${(Math.abs(d.pnl) / maxAbs * 100).toFixed(1)}%"></i></div>`).join('')}</div>
    <div class="dbx dim"><span>${p.days[0].day.slice(5)}</span><span>today</span></div></div>
  <div class="card" style="margin-top:12px"><h3>Tokens <span class="r">${p.tokens.length}</span></h3>${p.tokens.length ? `<div class="scroll"><table class="ptab"><thead><tr><th class="l">Token</th><th>Bought</th><th>Sold</th><th>Realized</th><th>Unrealized</th><th>Holding</th></tr></thead><tbody>
    ${p.tokens.slice(0, 60).map(t => { const m = r.meta[t.mint] || {}; return `<tr data-h="/token/${t.mint}"><td class="l"><div class="tok">${C.icon({ icon: m.icon, symbol: m.symbol || '?' }, 'ico sm')}<div class="nm"><span class="sym">${esc(m.symbol || C.short(t.mint))}</span><span class="sub">${t.buys}B / ${t.sells}S · ${C.age(t.last)} ago</span></div></div></td>
      <td>${C.usd(t.boughtUsd)}</td><td>${C.usd(t.soldUsd)}${t.unmatchedUsd > 0.5 ? '<sup class="dim" title="Part of the sells had no buy inside the scanned window and is excluded">*</sup>' : ''}</td><td class="${cls(t.realized)}">${money(t.realized)}</td><td class="${cls(t.unrealized)}">${t.unrealized == null ? '<span class="dim" title="No live price">n/a</span>' : money(t.unrealized)}</td><td>${t.value != null && t.held > 0 ? C.usd(t.value) : '<span class="dim">—</span>'}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="mut">No token trades found in the scanned transactions. Try a deeper scan.</div>'}</div>
  <div class="card" style="margin-top:12px"><h3>Recent trades</h3>${activityList(r.events.slice(0, 15), r.meta)}</div>
  <div class="note-est"><b>Estimate, not accounting.</b> Built from this wallet's last ${r.fetched}${r.partial ? ` of ${r.sigCount}` : ''} transactions${range ? ` (${range})` : ''} using on-chain balance changes, SOL/USD at trade time (GeckoTerminal) and current prices (DexScreener), average-cost basis. Fees &amp; rent count as cost. Excluded: sells of tokens bought before this window${p.unmatchedSells ? ` (${p.unmatchedSells})` : ''}, transfers/airdrops${p.transfers ? ` (${p.transfers})` : ''} and token↔token swaps${p.swaps ? ` (${p.swaps})` : ''}. Unrealized uses current balances × live price.${r.partial ? ' <span class="dn">Some transactions were skipped because the public RPC rate-limited us — run again to fill the gaps (cached ones are instant).</span>' : ''} Not financial or tax advice.</div>`;
  $('#pnlOut').querySelectorAll('tr[data-h]').forEach(tr => tr.onclick = () => C.go(tr.dataset.h));
  $('#cardBtn').onclick = () => cardModal(r, label);
}

// ---------- shareable PnL card ----------
const LOGO_ARCS = ['M73.3 21.0 A44 44 0 0 1 107.0 54.7', 'M107.0 73.3 A44 44 0 0 1 73.3 107.0', 'M54.7 107.0 A44 44 0 0 1 21.0 73.3', 'M21.0 54.7 A44 44 0 0 1 54.7 21.0', 'M64 4v26M64 98v26M4 64h26M98 64h26'];
const LOGO_T = 'M40 42h48v14H71v34H57V56H40z';
function drawLogo(g, x, y, size, alpha = 1) {
  g.save(); g.translate(x, y); g.scale(size / 128, size / 128); g.globalAlpha = alpha;
  const grad = g.createLinearGradient(20, 10, 108, 118); grad.addColorStop(0, '#22d3ee'); grad.addColorStop(0.5, '#4f7cff'); grad.addColorStop(1, '#8b3dff');
  g.strokeStyle = grad; g.lineWidth = 9; g.lineCap = 'butt'; LOGO_ARCS.forEach(d => g.stroke(new Path2D(d)));
  g.fillStyle = grad; g.fill(new Path2D(LOGO_T)); g.restore();
}
const PERIODS = { all: 'Scanned window', d30: 'Last 30 days', d7: 'Last 7 days', d1: 'Last 24 hours' };
async function renderCard(r, label, period) {
  try { await Promise.race([Promise.all([document.fonts.load('800 40px Inter'), document.fonts.load('600 20px Inter')]), sleep(1500)]); } catch {}
  const p = r.pnl; const W = 1200, H = 675;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  const head = period === 'all' ? p.total : p.periods[period].realized;
  const vol = period === 'all' ? p.volume : p.periods[period].volume;
  const trades = period === 'all' ? p.trades : p.periods[period].trades;
  const up = head >= 0; const accent = up ? '#14f195' : '#ff4d6a';
  // background
  const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#07090d'); bg.addColorStop(1, '#0d1220'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const glow = (x, y, rad, c) => { const rg = g.createRadialGradient(x, y, 0, x, y, rad); rg.addColorStop(0, c); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, H); };
  glow(1050, -40, 620, 'rgba(153,69,255,.22)'); glow(80, 40, 520, up ? 'rgba(20,241,149,.13)' : 'rgba(255,77,106,.13)');
  g.strokeStyle = 'rgba(255,255,255,.035)'; g.lineWidth = 1;
  for (let x = 0; x < W; x += 48) { g.beginPath(); g.moveTo(x + .5, 0); g.lineTo(x + .5, H); g.stroke(); }
  for (let y = 0; y < H; y += 48) { g.beginPath(); g.moveTo(0, y + .5); g.lineTo(W, y + .5); g.stroke(); }
  drawLogo(g, 760, 70, 520, 0.07); // big crosshair watermark
  // brand
  drawLogo(g, 56, 46, 60);
  g.font = '800 34px Inter, system-ui, sans-serif'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText('On the ', 130, 77);
  const tw = g.measureText('On the ').width; g.fillStyle = '#84e639'; g.fillText('Scope', 130 + tw, 77);
  // period pill
  g.font = '700 18px Inter, system-ui, sans-serif'; const pt = PERIODS[period].toUpperCase() + ' · PnL'; const pw = g.measureText(pt).width + 36;
  roundRect(g, W - 56 - pw, 56, pw, 42, 21); g.fillStyle = 'rgba(255,255,255,.06)'; g.fill(); g.strokeStyle = 'rgba(255,255,255,.12)'; g.stroke();
  g.fillStyle = '#c7cede'; g.fillText(pt, W - 56 - pw + 18, 78);
  // wallet
  g.font = '600 24px Inter, system-ui, sans-serif'; g.fillStyle = '#8590a6';
  g.fillText(`${label || 'Wallet'}  ·  ${r.addr.slice(0, 4)}…${r.addr.slice(-4)}`, 60, 178);
  g.font = '700 18px Inter, system-ui, sans-serif'; g.fillStyle = '#5b6479'; g.fillText(period === 'all' ? 'ESTIMATED TOTAL PnL' : 'ESTIMATED REALIZED PnL', 60, 222);
  // headline
  const big = money(head);
  let fs = 132; g.font = `800 ${fs}px Inter, system-ui, sans-serif`; while (g.measureText(big).width > 640 && fs > 60) { fs -= 6; g.font = `800 ${fs}px Inter, system-ui, sans-serif`; }
  g.shadowColor = accent + '66'; g.shadowBlur = 40; g.fillStyle = accent; g.fillText(big, 54, 310); g.shadowBlur = 0;
  // roi pill
  const roi = period === 'all' && p.roi != null ? `${p.roi >= 0 ? '+' : ''}${(p.roi * 100).toFixed(1)}% ROI` : `${trades} trades`;
  g.font = '800 24px Inter, system-ui, sans-serif'; const rw = g.measureText(roi).width + 36;
  roundRect(g, 60, 382, rw, 46, 23); g.fillStyle = up ? 'rgba(20,241,149,.12)' : 'rgba(255,77,106,.12)'; g.fill(); g.fillStyle = accent; g.fillText(roi, 78, 406);
  // cumulative realized PnL curve (right)
  const since = { all: 0, d30: Date.now() - 30 * 864e5, d7: Date.now() - 7 * 864e5, d1: Date.now() - 864e5 }[period];
  const pts = [{ t: 0, v: 0 }]; let cum = 0;
  for (const c of p.curve.filter(c => c.t >= since)) { cum += c.pnl; pts.push({ t: c.t, v: cum }); }
  if (pts.length === 1) pts.push({ t: 1, v: 0 });
  const bx = 760, by = 190, bw = 384, bh = 220;
  const t0 = 0, t1 = Math.max(1, pts.length - 1); pts.forEach((q, i) => { q.t = i; }); // evenly spaced by trade, reads better than clock time
  const vmin = Math.min(0, ...pts.map(q => q.v)), vmax = Math.max(0, ...pts.map(q => q.v)), vr = Math.max(1e-9, vmax - vmin);
  const X = t => bx + (t - t0) / (t1 - t0) * bw, Y = v => by + 8 + (1 - (v - vmin) / vr) * (bh - 16);
  roundRect(g, bx - 18, by - 46, bw + 36, bh + 64, 18); g.fillStyle = 'rgba(16,20,28,.6)'; g.fill(); g.strokeStyle = '#1d2330'; g.stroke();
  g.setLineDash([4, 6]); g.strokeStyle = 'rgba(255,255,255,.14)'; g.beginPath(); g.moveTo(bx, Y(0)); g.lineTo(bx + bw, Y(0)); g.stroke(); g.setLineDash([]);
  const path = new Path2D(); pts.forEach((q, i) => { const x = X(q.t), y = Y(q.v); if (!i) path.moveTo(x, y); else { path.lineTo(x, Y(pts[i - 1].v)); path.lineTo(x, y); } });
  const area = new Path2D(path); area.lineTo(X(pts[pts.length - 1].t), Y(0)); area.lineTo(X(pts[0].t), Y(0)); area.closePath();
  const ag = g.createLinearGradient(0, by, 0, by + bh); ag.addColorStop(0, up ? 'rgba(20,241,149,.28)' : 'rgba(255,77,106,.05)'); ag.addColorStop(1, up ? 'rgba(20,241,149,.02)' : 'rgba(255,77,106,.28)');
  g.fillStyle = ag; g.fill(area); g.strokeStyle = accent; g.lineWidth = 3.5; g.lineJoin = 'round'; g.stroke(path); g.lineWidth = 1;
  const lp = pts[pts.length - 1]; g.fillStyle = accent; g.beginPath(); g.arc(X(lp.t), Y(lp.v), 6, 0, Math.PI * 2); g.fill();
  g.font = '700 15px Inter, system-ui, sans-serif'; g.fillStyle = '#5b6479'; g.fillText('CUMULATIVE REALIZED', bx, by - 20);
  g.textAlign = 'right'; g.fillStyle = '#8590a6'; g.fillText(`${p.curve.filter(c => c.t >= since).length} sells`, bx + bw, by - 20); g.textAlign = 'left';
  // stats row
  const stats = [['Realized', money(period === 'all' ? p.realized : p.periods[period].realized), p.realized], ['Unrealized', money(p.unrealized), p.unrealized], ['Volume', C.usd(vol), null], ['Win rate', p.winRate != null ? (p.winRate * 100).toFixed(0) + '%' : '—', null]];
  const sw = (W - 120 - 3 * 16) / 4;
  stats.forEach(([k, v, n], i) => {
    const x = 60 + i * (sw + 16), y = 470; roundRect(g, x, y, sw, 104, 18); g.fillStyle = 'rgba(16,20,28,.85)'; g.fill(); g.strokeStyle = '#1d2330'; g.stroke();
    g.font = '700 15px Inter, system-ui, sans-serif'; g.fillStyle = '#5b6479'; g.fillText(k.toUpperCase(), x + 22, y + 32);
    g.font = '800 32px Inter, system-ui, sans-serif'; g.fillStyle = n == null ? '#e8ecf3' : n > 0 ? '#14f195' : n < 0 ? '#ff4d6a' : '#e8ecf3'; g.fillText(v, x + 22, y + 70);
  });
  // footer
  g.font = '600 17px Inter, system-ui, sans-serif'; g.fillStyle = '#8590a6'; g.fillText(location.host, 60, 625);
  g.textAlign = 'right'; g.fillStyle = '#5b6479'; g.fillText(`Estimate from on-chain data · not financial advice · ${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`, W - 60, 625); g.textAlign = 'left';
  return cv;
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
async function cardModal(r, label) {
  const { $, esc } = C;
  $('#pcard')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div class="modal-bg" id="pcard"><div class="modal pcard-m" role="dialog" aria-modal="true" aria-label="PnL card">
    <div class="pcard-top"><h2>Share your PnL card</h2><button class="x" id="pcX" aria-label="Close">✕</button></div>
    <div class="pf-chips">${Object.entries(PERIODS).map(([k, l]) => `<button class="chip ${k === 'all' ? 'on' : ''}" data-per="${k}">${k === 'all' ? 'All (scanned)' : l.replace('Last ', '')}</button>`).join('')}</div>
    <div class="pcard-img"><div class="skel" style="aspect-ratio:16/9;height:auto"></div></div>
    <div class="mbtns pcard-b"><button class="btn" id="pcCopy">Copy image</button><a class="btn" id="pcX2" target="_blank" rel="noopener">Post on 𝕏</a><button class="btn" id="pcShare">Share…</button><button class="btn pri" id="pcDl">⬇ Download PNG</button></div></div></div>`);
  const close = () => $('#pcard')?.remove();
  $('#pcX').onclick = close; $('#pcard').onclick = e => { if (e.target.id === 'pcard') close(); };
  let blob = null, per = 'all';
  const draw = async () => { try { await drawInner(); } catch (e) { const box = $('#pcard .pcard-img'); if (box) box.innerHTML = `<div class="err">Couldn't render the card: ${esc(e.message)}</div>`; } };
  const drawInner = async () => {
    const cv = await renderCard(r, label, per);
    blob = await new Promise(res => cv.toBlob(res, 'image/png'));
    const box = $('#pcard .pcard-img'); if (!box) return; box.innerHTML = ''; const img = new Image(); img.src = URL.createObjectURL(blob); img.alt = 'PnL card preview'; box.append(img);
    const head = per === 'all' ? r.pnl.total : r.pnl.periods[per].realized;
    $('#pcX2').href = 'https://x.com/intent/tweet?text=' + encodeURIComponent(`My ${PERIODS[per].toLowerCase()} Solana PnL: ${money(head).replace('−', '-')} 📈\nTracked with On the Scope`) + '&url=' + encodeURIComponent(location.origin);
  };
  $('#pcard').querySelectorAll('[data-per]').forEach(b => b.onclick = () => { per = b.dataset.per; $('#pcard').querySelectorAll('[data-per]').forEach(x => x.classList.toggle('on', x === b)); draw(); });
  const fname = () => `onthescope-pnl-${r.addr.slice(0, 6)}-${per}.png`;
  $('#pcDl').onclick = () => { if (!blob) return; const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname(); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
  $('#pcCopy').onclick = async () => { try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); C.toast('Card copied — paste it anywhere'); } catch { C.toast('Copy not supported here — use Download'); } };
  const file = () => new File([blob], fname(), { type: 'image/png' });
  if (!(navigator.canShare && navigator.canShare({ files: [new File([new Blob()], 'x.png', { type: 'image/png' })] }))) $('#pcShare').hidden = true;
  $('#pcShare').onclick = async () => { try { await navigator.share({ files: [file()], title: 'My On the Scope PnL', text: 'Tracked with On the Scope ' + location.origin }); } catch {} };
  draw();
}
