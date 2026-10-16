// TrenchScope frontend — vanilla JS, no build step.
const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = u => /^https?:\/\//i.test(u || '') ? u : null;
const api = async p => { const r = await fetch(p); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status); return j; };
const LS = { get: (k, d) => { try { return JSON.parse(localStorage.getItem('ts:' + k)) ?? d; } catch { return d; } }, set: (k, v) => localStorage.setItem('ts:' + k, JSON.stringify(v)) };

// ---------- formatting ----------
function usd(n, d) {
  if (n == null || isNaN(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(d ?? (a >= 1 ? 2 : 0));
}
function price(n) {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1) return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  if (n >= 0.0001) return '$' + n.toPrecision(4);
  const s = n.toExponential(3); const [m, e] = s.split('e-'); const zeros = +e - 1;
  return `$0.0<sub>${zeros}</sub>${m.replace('.', '').slice(0, 4)}`;
}
const pct = n => n == null || isNaN(n) ? '<span class="dim">—</span>' : `<span class="${n >= 0 ? 'up' : 'dn'}">${n >= 0 ? '+' : ''}${Math.abs(n) >= 1000 ? (n / 1000).toFixed(1) + 'K' : n.toFixed(Math.abs(n) >= 100 ? 0 : 1)}%</span>`;
function age(ts) {
  if (!ts) return '—';
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return Math.max(0, Math.floor(s)) + 's'; if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h'; if (s < 86400 * 60) return Math.floor(s / 86400) + 'd';
  return Math.floor(s / 86400 / 30) + 'mo';
}
const short = a => a ? a.slice(0, 4) + '…' + a.slice(-4) : '';
const icon = (r, cls = 'ico') => { const u = safeUrl(r.icon); return u ? `<img class="${cls}" src="${esc(u)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.outerHTML='<div class=&quot;${cls}&quot;>${esc((r.symbol || '?').slice(0, 2).replace(/[^\\w]/g, ''))}</div>'">` : `<div class="${cls}">${esc((r.symbol || '?').slice(0, 2))}</div>`; };
const links = (mint, pair) => ({
  jup: `https://jup.ag/swap/SOL-${mint}`,
  photon: pair ? `https://photon-sol.tinyastro.io/en/lp/${pair}` : `https://photon-sol.tinyastro.io/en/r/@trenchscope/${mint}`,
  safesign: `https://safesign-pg8h.onrender.com/?address=${mint}`,
  dex: `https://dexscreener.com/solana/${pair || mint}`,
  solscan: `https://solscan.io/token/${mint}`,
  rug: `https://rugcheck.xyz/tokens/${mint}`,
  pump: `https://pump.fun/coin/${mint}`,
});

// ---------- safety badge ----------
function badge(s, big) {
  if (!s) return `<span class="badge safe-n" title="Scanning with RugCheck…"><span class="skel" style="width:22px;height:9px"></span></span>`;
  if (s.unavailable) return `<span class="badge safe-n" title="Safety data unavailable">n/a</span>`;
  const c = s.grade === 'safe' ? 'g' : s.grade === 'caution' ? 'y' : 'r';
  return `<span class="badge safe-${c}" title="Safety score ${s.score}/100">${s.score}</span>`;
}
function pips(s) {
  if (!s || s.unavailable) return '';
  const p = (cls, t, tip) => `<span class="pip ${cls}" title="${esc(tip)}">${t}</span>`;
  return `<span class="pips">${p(s.mintAuth ? 'bad' : 'ok', 'M', s.mintAuth ? 'Mint authority ACTIVE' : 'Mint revoked')}${p(s.freezeAuth ? 'bad' : 'ok', 'F', s.freezeAuth ? 'Freeze authority ACTIVE' : 'Freeze revoked')}${s.lpLocked == null ? p('', 'LP', s.isCurve ? 'On bonding curve' : 'LP lock unknown') : p(s.lpLocked >= 90 ? 'ok' : s.lpLocked >= 50 ? 'wn' : 'bad', 'LP', `LP ${s.lpLocked.toFixed(0)}% locked/burned`)}${s.top10 == null ? '' : p(s.top10 > 50 ? 'bad' : s.top10 > 30 ? 'wn' : 'ok', 'T10', `Top 10 hold ${s.top10.toFixed(1)}%`)}${s.bundled ? p('bad', 'BNDL', 'Bundle / insider cluster detected') : ''}</span>`;
}

// ---------- watchlist & alerts ----------
let watch = LS.get('watch', {}); // mint -> {symbol, icon, addedAt}
let alerts = LS.get('alerts', []); // {id, mint, symbol, dir, price}
const isWatched = m => !!watch[m];
function toggleWatch(r) {
  if (watch[r.mint]) delete watch[r.mint]; else watch[r.mint] = { symbol: r.symbol, icon: r.icon, addedAt: Date.now() };
  LS.set('watch', watch);
  toast(watch[r.mint] ? `★ Added ${r.symbol} to watchlist` : `Removed ${r.symbol} from watchlist`);
}
function toast(msg, color) {
  const t = document.createElement('div'); t.className = 'toast'; if (color) t.style.borderLeftColor = color; t.innerHTML = msg;
  $('#toasts').append(t); setTimeout(() => t.remove(), 5000);
}
function renderAlertCount() { const c = $('#alertCount'); c.hidden = !alerts.length; c.textContent = alerts.length; }
async function checkAlerts() {
  renderAlertCount();
  if (!alerts.length) return;
  try {
    const { prices } = await api('/api/prices?mints=' + [...new Set(alerts.map(a => a.mint))].join(','));
    let changed = false;
    for (const a of [...alerts]) {
      const p = prices[a.mint]?.priceUsd; if (p == null) continue;
      if ((a.dir === 'above' && p >= a.price) || (a.dir === 'below' && p <= a.price)) {
        const msg = `🔔 ${a.symbol} is ${a.dir} ${price(a.price)} — now ${price(p)}`;
        toast(`<b>${msg}</b><br><a href="/token/${a.mint}" data-link style="color:var(--b)">Open chart →</a>`, a.dir === 'above' ? 'var(--g)' : 'var(--r)');
        if ('Notification' in window && Notification.permission === 'granted') new Notification('TrenchScope alert', { body: msg.replace(/<[^>]+>/g, '') });
        alerts = alerts.filter(x => x.id !== a.id); changed = true;
      }
    }
    if (changed) { LS.set('alerts', alerts); renderAlertCount(); }
  } catch {}
}
setInterval(checkAlerts, 30000); checkAlerts();
$('#alertsBtn').onclick = () => {
  const d = $('#drawer');
  if (!d.hidden) return (d.hidden = true);
  d.innerHTML = `<h3 style="margin:0 0 8px">Price alerts</h3><p class="mut" style="margin:0 0 10px;font-size:12px">Checked every 30s while this tab is open. Stored only in your browser.</p>` +
    (alerts.length ? alerts.map(a => `<div class="al"><a href="/token/${a.mint}" data-link><b>${esc(a.symbol)}</b></a><span class="mut">${a.dir}</span><span class="mono">${price(a.price)}</span><button class="x" data-del="${a.id}">✕</button></div>`).join('') : '<div class="mut">No alerts yet. Open a token and set one.</div>');
  d.hidden = false;
  d.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { alerts = alerts.filter(a => a.id != b.dataset.del); LS.set('alerts', alerts); renderAlertCount(); d.hidden = true; $('#alertsBtn').click(); });
};
document.addEventListener('click', e => { const d = $('#drawer'); if (!d.hidden && !d.contains(e.target) && !$('#alertsBtn').contains(e.target)) d.hidden = true; });

// ---------- router ----------
let cleanup = [];
function go(path) { history.pushState(null, '', path); route(); }
document.addEventListener('click', e => {
  const a = e.target.closest('a[data-link]');
  if (a && !e.metaKey && !e.ctrlKey) { e.preventDefault(); go(a.getAttribute('href')); }
});
window.onpopstate = route;
function route() {
  cleanup.forEach(f => f()); cleanup = [];
  $('#results').hidden = true; $('#drawer').hidden = true;
  const m = location.pathname.match(/^\/token\/([1-9A-HJ-NP-Za-km-z]{32,44})/);
  window.scrollTo(0, 0);
  if (m) tokenPage(m[1]); else listPage();
}

// ---------- list page ----------
const TABS = [
  { id: 'trending', label: '🔥 Trending', desc: 'Hottest Solana pairs right now (GeckoTerminal trending + DexScreener boosts), enriched with live DexScreener stats.' },
  { id: 'new', label: '✨ New pairs', desc: 'Freshly created pools and newly listed token profiles, newest first.' },
  { id: 'gainers', label: '🚀 Gainers', desc: 'Biggest 24h movers with at least $5K liquidity across tracked pairs.' },
  { id: 'pumpfun', label: '<span class="dot"></span> Pump.fun live', desc: 'Coins currently live-streaming on pump.fun (bonding curve & migrated).' },
  { id: 'watch', label: '★ Watchlist', desc: 'Your starred tokens — saved locally in this browser.' },
];
const DEF = { tab: 'trending', liq: 0, vol: 0, mcapMin: 0, mcapMax: 0, age: 0, safeOnly: false, noBundle: false, sort: null, dir: -1 };
let st = { ...DEF, ...LS.get('filters', {}) };
const saveSt = () => LS.set('filters', st);
let rows = [], safetyMap = {}, lastUpdated = 0;

function filtered() {
  let r = rows.map(x => ({ ...x, safety: safetyMap[x.mint] || x.safety }));
  const n = v => v ?? 0;
  if (st.liq) r = r.filter(x => n(x.liquidity) >= st.liq || (st.tab === 'pumpfun' && x.liquidity == null));
  if (st.vol) r = r.filter(x => n(x.volume?.h24) >= st.vol);
  if (st.mcapMin) r = r.filter(x => n(x.mcap || x.fdv) >= st.mcapMin);
  if (st.mcapMax) r = r.filter(x => n(x.mcap || x.fdv) <= st.mcapMax);
  if (st.age) r = r.filter(x => x.createdAt && Date.now() - x.createdAt <= st.age * 3600e3);
  if (st.safeOnly) r = r.filter(x => x.safety && !x.safety.unavailable && x.safety.grade === 'safe');
  if (st.noBundle) r = r.filter(x => !(x.safety && x.safety.bundled));
  if (st.sort) {
    const get = { price: x => x.priceUsd, age: x => -(x.createdAt || 0), m5: x => x.change?.m5, h1: x => x.change?.h1, h6: x => x.change?.h6, h24: x => x.change?.h24, vol: x => x.volume?.h24, liq: x => x.liquidity, mcap: x => x.mcap || x.fdv, txns: x => (x.txns?.h24?.buys || 0) + (x.txns?.h24?.sells || 0), safety: x => x.safety?.score ?? -1 }[st.sort];
    if (get) r.sort((a, b) => ((get(a) ?? -Infinity) - (get(b) ?? -Infinity)) * st.dir);
  }
  return r;
}
const sel = (key, label, opts) => `<label class="f">${label}<select data-k="${key}">${opts.map(([v, t]) => `<option value="${v}" ${+st[key] === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
const tog = (key, label) => `<button class="toggle ${st[key] ? 'on' : ''}" data-t="${key}"><span class="sw"></span>${label}</button>`;

function listPage() {
  document.title = 'TrenchScope — Solana screener with safety on every row';
  const tab = TABS.find(t => t.id === st.tab) || TABS[0];
  app.innerHTML = `
  <section class="hero"><div><h1>${tab.label.replace(/<[^>]+>/g, '')} <span class="mut" style="font-weight:500">on Solana</span></h1><p>${tab.desc}</p></div>
  <div class="stats" id="stats"></div></section>
  <nav class="tabs">${TABS.map(t => `<button class="tab ${t.id === st.tab ? 'on' : ''}" data-tab="${t.id}">${t.label}${t.id === 'watch' ? ` <span class="chip">${Object.keys(watch).length}</span>` : ''}</button>`).join('')}</nav>
  <div class="bar"><div class="filters">
    ${tog('safeOnly', '🛡 Safe only')}${tog('noBundle', 'Hide bundled')}
    ${sel('liq', 'Liq ≥', [[0, 'Any'], [5000, '$5K'], [10000, '$10K'], [50000, '$50K'], [100000, '$100K'], [500000, '$500K']])}
    ${sel('vol', 'Vol 24h ≥', [[0, 'Any'], [10000, '$10K'], [50000, '$50K'], [100000, '$100K'], [1000000, '$1M']])}
    ${sel('mcapMin', 'MCap ≥', [[0, 'Any'], [10000, '$10K'], [100000, '$100K'], [1000000, '$1M'], [10000000, '$10M']])}
    ${sel('mcapMax', 'MCap ≤', [[0, 'Any'], [100000, '$100K'], [1000000, '$1M'], [10000000, '$10M'], [100000000, '$100M']])}
    ${sel('age', 'Age ≤', [[0, 'Any'], [1, '1h'], [6, '6h'], [24, '24h'], [72, '3d'], [168, '7d']])}
    ${JSON.stringify({ ...st, tab: 0, sort: 0, dir: 0 }) !== JSON.stringify({ ...DEF, tab: 0, sort: 0, dir: 0 }) ? `<button class="toggle" id="reset">Reset</button>` : ''}
  </div><div class="upd" id="upd"></div></div>
  <div class="tablewrap desk"><div class="scroll"><table><thead><tr>${head()}</tr></thead><tbody id="tb">${skeleton()}</tbody></table></div></div>
  <div class="cards" id="cards">${'<div class="c"><div class="skel" style="grid-column:1/-1;height:40px"></div></div>'.repeat(6)}</div>`;
  app.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { st.tab = b.dataset.tab; st.sort = null; saveSt(); listPage(); });
  app.querySelectorAll('[data-k]').forEach(s => s.onchange = () => { st[s.dataset.k] = +s.value; saveSt(); listPage(); });
  app.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { st[b.dataset.t] = !st[b.dataset.t]; saveSt(); listPage(); });
  const rs = $('#reset'); if (rs) rs.onclick = () => { st = { ...DEF, tab: st.tab }; saveSt(); listPage(); };
  app.querySelectorAll('th[data-s]').forEach(th => th.onclick = () => { const k = th.dataset.s; if (st.sort === k) st.dir *= -1; else { st.sort = k; st.dir = -1; } saveSt(); listPage(); });
  load(true);
  const iv = setInterval(() => load(false), 30000); cleanup.push(() => clearInterval(iv));
  const sv = setInterval(pollSafety, 4000); cleanup.push(() => clearInterval(sv));
}
function head() {
  const h = (k, t, l) => `<th class="${l ? 'l' : ''} ${st.sort === k ? 'on' : ''}" ${k ? `data-s="${k}"` : ''}>${t}${st.sort === k ? (st.dir < 0 ? ' ↓' : ' ↑') : ''}</th>`;
  return `<th class="l"></th>${h('', 'Token', 1)}${h('safety', 'Safety', 1)}${h('price', 'Price')}${h('age', 'Age')}${h('txns', 'Txns 24h')}${h('vol', 'Volume')}${h('m5', '5m')}${h('h1', '1h')}${h('h6', '6h')}${h('h24', '24h')}${h('liq', 'Liquidity')}${h('mcap', 'MCap')}<th></th>`;
}
const skeleton = () => Array(10).fill(`<tr>${'<td><div class="skel"></div></td>'.repeat(14)}</tr>`).join('');

async function load(first) {
  try {
    if (st.tab === 'watch') {
      const mints = Object.keys(watch);
      if (!mints.length) { rows = []; draw(); return; }
      const { prices } = await api('/api/prices?mints=' + mints.join(','));
      rows = mints.map(m => ({ mint: m, symbol: watch[m].symbol, icon: watch[m].icon, ...(prices[m] || {}), change: prices[m]?.change || {}, volume: {}, }));
      // fetch fuller rows for watched tokens via search-free path: reuse token endpoint lazily
      lastUpdated = Date.now();
    } else {
      const d = await api('/api/list/' + st.tab);
      rows = d.rows; lastUpdated = d.updatedAt;
      for (const r of rows) if (r.safety) safetyMap[r.mint] = r.safety;
    }
    draw(); pollSafety();
  } catch (e) {
    if (first) { $('#tb').innerHTML = `<tr><td colspan="14" class="err">Couldn't load data: ${esc(e.message)}. Retrying…</td></tr>`; $('#cards').innerHTML = `<div class="err">Couldn't load data. Retrying…</div>`; }
  }
}
async function pollSafety() {
  const need = rows.slice(0, 150).map(r => r.mint).filter(m => !safetyMap[m]);
  if (!need.length) return;
  try {
    const { safety } = await api('/api/safety?mints=' + need.join(','));
    let n = 0; for (const [m, s] of Object.entries(safety)) { safetyMap[m] = s; n++; }
    if (n) draw();
  } catch {}
}
function draw() {
  const r = filtered();
  const tb = $('#tb'); if (!tb) return;
  const scanned = rows.filter(x => safetyMap[x.mint] && !safetyMap[x.mint].unavailable);
  const safeN = scanned.filter(x => safetyMap[x.mint].grade === 'safe').length;
  const bund = scanned.filter(x => safetyMap[x.mint].bundled).length;
  $('#stats').innerHTML = rows.length ? `<div class="stat"><small>Pairs</small><b>${rows.length}</b></div><div class="stat"><small>Scanned</small><b>${scanned.length}</b></div><div class="stat"><small>Safe ≥80</small><b class="up">${safeN}</b></div><div class="stat"><small>Bundled</small><b class="dn">${bund}</b></div>` : '';
  $('#upd').innerHTML = lastUpdated ? `<span class="live"></span> ${r.length} shown · updated ${age(lastUpdated)} ago · auto-refresh 30s` : '';
  if (!r.length) {
    const msg = st.tab === 'watch' && !Object.keys(watch).length ? 'Your watchlist is empty. Tap ☆ on any token to track it here.' : st.safeOnly && scanned.length < rows.length ? 'No tokens pass the filters yet — safety scans are still running, give it a few seconds.' : 'No tokens match these filters.';
    tb.innerHTML = `<tr><td colspan="14" class="empty">${msg}</td></tr>`; $('#cards').innerHTML = `<div class="empty">${msg}</div>`; return;
  }
  const isNew = x => x.createdAt && Date.now() - x.createdAt < 86400e3;
  tb.innerHTML = r.slice(0, 200).map((x, i) => {
    const b = x.txns?.h24?.buys, s = x.txns?.h24?.sells, tot = (b || 0) + (s || 0);
    const L = links(x.mint, x.pair);
    return `<tr data-m="${x.mint}">
      <td class="l"><button class="star ${isWatched(x.mint) ? 'on' : ''}" data-w="${x.mint}" title="Watchlist">${isWatched(x.mint) ? '★' : '☆'}</button></td>
      <td class="l"><div class="tok">${icon(x)}<div class="nm"><span class="sym">${esc(x.symbol)} ${x.boosts ? `<span class="chip boost">⚡${x.boosts}</span>` : ''}${isNew(x) ? '<span class="chip new">NEW</span>' : ''}</span><span class="sub">${esc(x.name)}${x.dex ? ' · ' + esc(x.dex) : ''}</span></div></div></td>
      <td class="l"><span class="safe">${badge(x.safety)}${pips(x.safety)}</span></td>
      <td class="mono">${price(x.priceUsd)}</td><td class="mut">${age(x.createdAt)}</td>
      <td>${tot ? `<div class="txbar"><span>${tot.toLocaleString()}</span><span class="b"><i style="width:${(b / tot * 100).toFixed(0)}%"></i></span></div>` : '<span class="dim">—</span>'}</td>
      <td>${usd(x.volume?.h24)}</td><td>${pct(x.change?.m5)}</td><td>${pct(x.change?.h1)}</td><td>${pct(x.change?.h6)}</td><td>${pct(x.change?.h24)}</td>
      <td>${usd(x.liquidity)}</td><td>${usd(x.mcap || x.fdv)}</td>
      <td><a class="buy" href="${L.jup}" target="_blank" rel="noopener" data-stop>Buy</a></td></tr>`;
  }).join('');
  $('#cards').innerHTML = r.slice(0, 100).map(x => `<div class="c" data-m="${x.mint}">
      <div class="tok" style="grid-column:1/3">${icon(x)}<div class="nm"><span class="sym">${esc(x.symbol)} ${isNew(x) ? '<span class="chip new">NEW</span>' : ''}</span><span class="sub">${esc(x.name)} · ${age(x.createdAt)}</span></div></div>
      <div class="pr"><b class="mono">${price(x.priceUsd)}</b>${pct(x.change?.h24 ?? x.change?.h1)}</div>
      <div class="sf"><span class="safe">${badge(x.safety)}${pips(x.safety)}</span><span style="display:flex;gap:6px;align-items:center"><button class="star ${isWatched(x.mint) ? 'on' : ''}" data-w="${x.mint}">${isWatched(x.mint) ? '★' : '☆'}</button><a class="buy" href="${links(x.mint, x.pair).jup}" target="_blank" rel="noopener" data-stop>Buy</a></span></div>
      <div class="meta"><span>Liq <b>${usd(x.liquidity)}</b></span><span>Vol <b>${usd(x.volume?.h24)}</b></span><span>MCap <b>${usd(x.mcap || x.fdv)}</b></span><span>1h ${pct(x.change?.h1)}</span></div></div>`).join('');
  app.querySelectorAll('[data-m]').forEach(el => el.onclick = e => {
    if (e.target.closest('[data-stop]')) return;
    const w = e.target.closest('[data-w]');
    if (w) { const row = rows.find(z => z.mint === w.dataset.w); toggleWatch(row); if (st.tab === 'watch') load(); else draw(); return; }
    go('/token/' + el.dataset.m);
  });
}

// ---------- search ----------
let sTimer, sSel = -1;
$('#q').addEventListener('input', e => {
  clearTimeout(sTimer); const q = e.target.value.trim(); const box = $('#results');
  if (!q) return (box.hidden = true);
  sTimer = setTimeout(async () => {
    box.hidden = false; box.innerHTML = '<div class="mut" style="padding:10px">Searching…</div>';
    try {
      const { rows } = await api('/api/search?q=' + encodeURIComponent(q));
      const direct = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(q) && !rows.some(r => r.mint === q) ? `<a href="/token/${q}" data-link><div class="ico">↗</div><div><b>Open mint</b><div class="dim mono" style="font-size:11px">${esc(short(q))}</div></div></a>` : '';
      box.innerHTML = direct + (rows.length ? rows.map(r => `<a href="/token/${r.mint}" data-link>${icon(r)}<div><b>${esc(r.symbol)}</b> <span class="mut">${esc(r.name)}</span><div class="dim" style="font-size:11px">${esc(r.dex)} · ${age(r.createdAt)}</div></div><div class="rmeta"><div class="mono" style="color:var(--tx)">${price(r.priceUsd)}</div>Liq ${usd(r.liquidity)}</div></a>`).join('') : (direct ? '' : '<div class="mut" style="padding:10px">No Solana pairs found.</div>'));
      sSel = -1;
    } catch (err) { box.innerHTML = `<div class="err" style="padding:10px">${esc(err.message)}</div>`; }
  }, 280);
});
$('#q').addEventListener('keydown', e => {
  const items = [...$('#results').querySelectorAll('a')];
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sSel = Math.max(0, Math.min(items.length - 1, sSel + (e.key === 'ArrowDown' ? 1 : -1))); items.forEach((a, i) => a.classList.toggle('sel', i === sSel)); }
  if (e.key === 'Escape') { $('#results').hidden = true; e.target.blur(); }
});
$('#searchForm').onsubmit = e => { e.preventDefault(); const items = [...$('#results').querySelectorAll('a')]; const a = items[Math.max(0, sSel)]; if (a) { go(a.getAttribute('href')); $('#q').value = ''; $('#q').blur(); } };
document.addEventListener('keydown', e => { if (e.key === '/' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); $('#q').focus(); } });
document.addEventListener('click', e => { if (!$('#searchForm').contains(e.target)) $('#results').hidden = true; else if (e.target.closest('#results a')) { $('#q').value = ''; } });

// ---------- token page ----------
async function tokenPage(mint) {
  app.innerHTML = `<div class="tp-head"><div class="ico"></div><div style="flex:1"><div class="skel" style="width:200px;height:22px"></div><div class="skel" style="width:300px;margin-top:8px"></div></div></div><div class="kpis">${'<div class="kpi"><div class="skel"></div></div>'.repeat(4)}</div><div class="card" style="height:430px"></div>`;
  let d;
  try { d = await api('/api/token/' + mint); } catch (e) { app.innerHTML = `<div class="err">Couldn't load token: ${esc(e.message)}</div><p style="text-align:center"><a href="/" data-link class="btn">← Back to screener</a></p>`; return; }
  const m = d.main || {}; const s = d.safety || {}; const L = links(mint, m.pair);
  document.title = `${d.symbol || short(mint)} ${m.priceUsd ? '· ' + price(m.priceUsd).replace(/<[^>]+>/g, '') : ''} — TrenchScope`;
  const sv = !s.unavailable;
  const ringC = !sv ? 'var(--dim)' : s.grade === 'safe' ? 'var(--g)' : s.grade === 'caution' ? 'var(--y)' : 'var(--r)';
  const verdict = !sv ? '' : s.grade === 'safe' ? `<div class="verdict g">✓ No major red flags found. Still DYOR — memecoins are high risk.</div>` : s.grade === 'caution' ? `<div class="verdict y">⚠ Some risk factors — review the flags before aping.</div>` : `<div class="verdict r">⛔ High risk — serious red flags detected.</div>`;
  const socials = [...(m.websites || []).map(w => ({ label: w.label || 'Website', url: w.url })), ...(m.socials || []).map(x => ({ label: x.type, url: x.url }))].filter(x => safeUrl(x.url));
  const b24 = m.txns?.h24?.buys, s24 = m.txns?.h24?.sells;
  app.innerHTML = `
  <a href="/" data-link class="mut" style="font-size:13px">← Screener</a>
  <div class="tp-head" style="margin-top:10px">${icon({ icon: d.icon, symbol: d.symbol })}
    <div><h1>${esc(d.symbol || '?')} <span class="mut" style="font-weight:500;font-size:16px">${esc(d.name || '')}</span> ${sv ? badge(s) : ''}</h1>
      <div class="addr"><span>${esc(short(mint))}</span><button class="copy" data-copy="${mint}">Copy CA</button>${m.dex ? `<span class="chip">${esc(m.dex)}</span>` : ''}${s.launchpad ? `<span class="chip">${esc(s.launchpad)}</span>` : ''}${m.createdAt ? `<span class="chip">Pair age ${age(m.createdAt)}</span>` : ''}${socials.map(x => `<a class="chip" href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.label)} ↗</a>`).join('')}</div></div>
    <div class="price-big"><b class="mono">${price(m.priceUsd)}</b>${pct(m.change?.h24)} <span class="dim">24h</span></div>
  </div>
  <div class="actions">
    <a class="btn pri" href="${L.jup}" target="_blank" rel="noopener">⚡ Buy on Jupiter</a>
    <a class="btn vio" href="${L.photon}" target="_blank" rel="noopener">Trade on Photon</a>
    <a class="btn ss" href="${L.safesign}" target="_blank" rel="noopener">🛡 Deep scan on SafeSign</a>
    <button class="btn" id="wbtn">${isWatched(mint) ? '★ Watching' : '☆ Watchlist'}</button>
    <a class="btn" href="${L.dex}" target="_blank" rel="noopener">DexScreener ↗</a>
    <a class="btn" href="${L.solscan}" target="_blank" rel="noopener">Solscan ↗</a>
    <a class="btn" href="${L.rug}" target="_blank" rel="noopener">RugCheck ↗</a>
    ${d.pump ? `<a class="btn" href="${L.pump}" target="_blank" rel="noopener">pump.fun ↗</a>` : ''}
  </div>
  <div class="kpis">
    <div class="kpi"><small>Market cap</small><b>${usd(m.mcap ?? d.pump?.usdMcap)}</b><span class="dim" style="font-size:12px">FDV ${usd(m.fdv)}</span></div>
    <div class="kpi"><small>Liquidity</small><b>${usd(m.liquidity)}</b><span class="dim" style="font-size:12px">${m.liquidity && m.mcap ? 'Liq/MCap ' + (m.liquidity / m.mcap * 100).toFixed(1) + '%' : '&nbsp;'}</span></div>
    <div class="kpi"><small>Volume 24h</small><b>${usd(m.volume?.h24)}</b><span class="dim" style="font-size:12px">1h ${usd(m.volume?.h1)}</span></div>
    <div class="kpi"><small>Holders</small><b>${s.holders != null ? s.holders.toLocaleString() : '—'}</b><span class="dim" style="font-size:12px">${b24 != null ? `24h <span class="up">${b24.toLocaleString()} buys</span> / <span class="dn">${s24.toLocaleString()} sells</span>` : '&nbsp;'}</span></div>
  </div>
  <div class="grid">
    <div class="stack">
      <div class="card chartcard"><div class="chart-top">${['1m', '5m', '15m', '1h', '4h', '1d'].map(t => `<button class="tf" data-tf="${t}">${t}</button>`).join('')}<span class="dim" style="margin-left:auto;font-size:12px">${m.pair ? 'GeckoTerminal OHLCV · USD' : ''}</span></div><div id="chart">${m.pair ? '' : '<div class="empty">No trading pair found yet.</div>'}</div>
        <div class="chg-row">${['m5', 'h1', 'h6', 'h24'].map(k => `<div><small>${k.replace('m', '').replace('h', '')}${k[0]}</small>${pct(m.change?.[k])}</div>`).join('')}</div></div>
      <div class="card trades"><h3>Recent trades <span class="r" id="trUpd"></span></h3><div class="scroll" id="trades"><div class="skel"></div></div></div>
      ${d.pairs?.length > 1 ? `<div class="card"><h3>Pools</h3><div class="scroll"><table style="min-width:520px"><thead><tr><th class="l">DEX</th><th class="l">Pair</th><th>Price</th><th>Liquidity</th><th>Vol 24h</th></tr></thead><tbody>${d.pairs.map(p => `<tr onclick="window.open('${links(mint, p.pair).dex}','_blank')"><td class="l">${esc(p.dex)}</td><td class="l mono dim">${esc(short(p.pair))} · ${esc(p.quote)}</td><td class="mono">${price(p.priceUsd)}</td><td>${usd(p.liquidity)}</td><td>${usd(p.volume?.h24)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
    </div>
    <div class="stack">
      <div class="card"><h3>🛡 Safety <span class="r">RugCheck + GoPlus</span></h3>
        ${sv ? `<div class="score-ring"><div class="ring" style="--v:${s.score};--c:${ringC}"><span style="color:${ringC}">${s.score}</span></div><div><div style="font-weight:800;font-size:16px;text-transform:capitalize">${s.grade === 'safe' ? 'Looks clean' : s.grade === 'caution' ? 'Caution' : 'High risk'}</div><div class="mut" style="font-size:12px">TrenchScope score /100</div><div style="margin-top:6px">${pips(s)}</div></div></div>
        <div class="flags">${s.flags.map(f => `<div class="flag ${f.level}"><i></i><div><b>${esc(f.title)}</b><p>${esc(f.detail)}</p></div></div>`).join('')}</div>${verdict}` : `<div class="mut">Safety data unavailable right now${s.error ? ' (' + esc(s.error) + ')' : ''}. Try the <a href="${L.safesign}" target="_blank" style="color:var(--b)">SafeSign deep scan</a>.</div>`}
      </div>
      <div class="card"><h3>🧨 Bundle / sniper check</h3>${sv ? `
        <dl class="kv"><dt>Verdict</dt><dd class="${s.bundled ? 'dn' : 'up'}">${s.bundled ? 'Likely bundled / sniped' : 'No strong bundle signal'}</dd>
        <dt>Linked wallet clusters</dt><dd>${s.insiderClusters}</dd><dt>Largest cluster</dt><dd>${s.biggestCluster ? s.biggestCluster + ' wallets' : '—'}</dd>
        <dt>Supply held by clusters</dt><dd>${s.insiderPct != null ? s.insiderPct.toFixed(1) + '%' : '—'}</dd></dl>
        <p class="dim" style="font-size:11px;margin:10px 0 0">Heuristic from RugCheck's wallet transfer graph: groups of wallets funded/linked together that still hold supply. Huge (>200 wallet) graphs are ignored as exchange noise.</p>` : '<div class="mut">Unavailable.</div>'}</div>
      <div class="card"><h3>👤 Dev wallet</h3>${d.dev ? `<dl class="kv">
        <dt>Creator</dt><dd><a class="mono" style="color:var(--b)" href="https://solscan.io/account/${esc(d.dev.address)}" target="_blank" rel="noopener">${esc(short(d.dev.address))} ↗</a></dd>
        <dt>Holds of supply</dt><dd class="${d.dev.holdingPct > 5 ? 'dn' : ''}">${d.dev.holdingPct != null ? d.dev.holdingPct.toFixed(2) + '%' : '—'}</dd>
        <dt>SOL balance</dt><dd>${d.dev.solBalance != null ? d.dev.solBalance.toLocaleString(undefined, { maximumFractionDigits: 3 }) + ' SOL' : '—'}</dd>
        <dt>Other tokens created</dt><dd>${d.dev.otherTokens != null ? d.dev.otherTokens : '—'}</dd></dl>` : '<div class="mut">Creator not reported by data sources.</div>'}</div>
      <div class="card"><h3>👥 Holder concentration <span class="r">${s.top10 != null ? 'Top 10: ' + s.top10.toFixed(1) + '%' : ''}</span></h3>${sv && s.topHolders?.length ? s.topHolders.slice(0, 10).map(h => `<div class="hbar ${h.insider ? 'ins' : ''}"><a class="w" href="https://solscan.io/account/${esc(h.owner)}" target="_blank" rel="noopener">${esc(short(h.owner))}</a><div class="t"><i style="width:${Math.min(100, h.pct * 3)}%"></i></div><span class="mono" style="width:50px;text-align:right">${h.pct.toFixed(2)}%</span></div>`).join('') + `<p class="dim" style="font-size:11px;margin:8px 0 0">Excludes AMM pools, lockers and known program accounts. Red = flagged insider.</p>` : '<div class="mut">No holder data.</div>'}</div>
      <div class="card"><h3>🔔 Price alert</h3><form class="alertform" id="alertForm"><select id="adir"><option value="above">Above</option><option value="below">Below</option></select><input id="aprice" inputmode="decimal" placeholder="${m.priceUsd ? 'e.g. ' + (+(m.priceUsd * 1.5).toPrecision(3)) : 'price USD'}" required><button class="btn pri" style="padding:8px 12px">Set</button></form>
        <div id="myAlerts" style="margin-top:8px"></div></div>
    </div>
  </div>`;
  app.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => { navigator.clipboard?.writeText(b.dataset.copy); b.textContent = 'Copied ✓'; setTimeout(() => (b.textContent = 'Copy CA'), 1500); });
  $('#wbtn').onclick = () => { toggleWatch({ mint, symbol: d.symbol, icon: d.icon }); $('#wbtn').textContent = isWatched(mint) ? '★ Watching' : '☆ Watchlist'; };
  const drawMy = () => { const mine = alerts.filter(a => a.mint === mint); $('#myAlerts').innerHTML = mine.map(a => `<div class="al"><span class="mut">${a.dir}</span><span class="mono">${price(a.price)}</span><button class="x" data-del="${a.id}">✕</button></div>`).join(''); $('#myAlerts').querySelectorAll('[data-del]').forEach(b => b.onclick = () => { alerts = alerts.filter(a => a.id != b.dataset.del); LS.set('alerts', alerts); renderAlertCount(); drawMy(); }); };
  drawMy();
  $('#alertForm').onsubmit = e => {
    e.preventDefault(); const p = parseFloat($('#aprice').value); if (!(p > 0)) return;
    alerts.push({ id: Date.now(), mint, symbol: d.symbol, dir: $('#adir').value, price: p }); LS.set('alerts', alerts); renderAlertCount(); drawMy(); $('#aprice').value = '';
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    toast(`Alert set: ${esc(d.symbol)} ${$('#adir').value} ${price(p)}`);
  };
  if (m.pair) {
    initChart(m.pair, m.priceUsd);
    loadTrades(m.pair, d.symbol); const iv = setInterval(() => loadTrades(m.pair, d.symbol), 20000); cleanup.push(() => clearInterval(iv));
  } else $('#trades').innerHTML = '<div class="mut">No pool yet.</div>';
}
async function loadTrades(pool, sym) {
  try {
    const { rows } = await api('/api/trades/' + pool);
    const el = $('#trades'); if (!el) return;
    $('#trUpd').textContent = 'live · 20s';
    el.innerHTML = rows.length ? `<table><thead><tr><th class="l">Time</th><th class="l">Type</th><th>USD</th><th>${esc(sym)}</th><th>Price</th><th class="l">Wallet</th></tr></thead><tbody>${rows.slice(0, 25).map(t => `<tr onclick="window.open('https://solscan.io/tx/${esc(t.tx)}','_blank')"><td class="l dim">${age(Date.parse(t.at))} ago</td><td class="l ${t.kind === 'buy' ? 'up' : 'dn'}" style="font-weight:700">${t.kind === 'buy' ? 'Buy' : 'Sell'}</td><td class="${t.kind === 'buy' ? 'up' : 'dn'}">${usd(t.usd, 2)}</td><td class="mono">${t.tokenAmount != null ? Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 }).format(t.tokenAmount) : '—'}</td><td class="mono">${price(t.price)}</td><td class="l mono"><a style="color:var(--b)" href="https://solscan.io/account/${esc(t.wallet)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${esc(short(t.wallet))}</a></td></tr>`).join('')}</tbody></table>` : '<div class="mut">No recent trades reported.</div>';
  } catch (e) { const el = $('#trades'); if (el && !el.querySelector('table')) el.innerHTML = `<div class="mut">Trades unavailable (${esc(e.message)}).</div>`; }
}
function initChart(pool, lastPrice) {
  const el = $('#chart');
  const LW = window.LightweightCharts;
  const prec = lastPrice ? Math.min(12, Math.max(2, Math.ceil(-Math.log10(lastPrice)) + 4)) : 8;
  const chart = LW.createChart(el, {
    autoSize: true, layout: { background: { color: 'transparent' }, textColor: '#8590a6', fontFamily: 'Inter' },
    grid: { vertLines: { color: 'rgba(29,35,48,.6)' }, horzLines: { color: 'rgba(29,35,48,.6)' } },
    rightPriceScale: { borderColor: '#1d2330' }, timeScale: { borderColor: '#1d2330', timeVisible: true, secondsVisible: false },
    crosshair: { mode: 0 },
  });
  const cs = chart.addCandlestickSeries({ upColor: '#14f195', downColor: '#ff4d6a', borderVisible: false, wickUpColor: '#14f195', wickDownColor: '#ff4d6a', priceFormat: { type: 'price', precision: prec, minMove: Math.pow(10, -prec) } });
  const vs = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'v' });
  chart.priceScale('v').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
  cs.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.22 } });
  let tf = LS.get('tf', '5m');
  const load = async (fit) => {
    app.querySelectorAll('[data-tf]').forEach(b => b.classList.toggle('on', b.dataset.tf === tf));
    try {
      const { candles } = await api(`/api/ohlcv/${pool}?tf=${tf}`);
      if (!candles.length) { el.insertAdjacentHTML('beforeend', '<div class="empty" style="position:absolute;inset:0" id="nochart">No candle data yet for this pool.</div>'); return; }
      $('#nochart')?.remove();
      cs.setData(candles); vs.setData(candles.map(c => ({ time: c.time, value: c.volume, color: c.close >= c.open ? 'rgba(20,241,149,.35)' : 'rgba(255,77,106,.35)' })));
      if (fit) chart.timeScale().fitContent();
    } catch (e) { if (fit) el.insertAdjacentHTML('beforeend', `<div class="empty" style="position:absolute;inset:0" id="nochart">Chart unavailable: ${esc(e.message)}</div>`); }
  };
  app.querySelectorAll('[data-tf]').forEach(b => b.onclick = () => { tf = b.dataset.tf; LS.set('tf', tf); load(true); });
  load(true);
  const iv = setInterval(() => load(false), 45000);
  cleanup.push(() => { clearInterval(iv); chart.remove(); });
}

route();
