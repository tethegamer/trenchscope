// On the Scope frontend — vanilla JS, no build step.
import * as BUY from './buy.js';
import * as AL from './alerts-client.js';
const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = u => /^https?:\/\//i.test(u || '') ? u : null;
const api = async p => { const r = await fetch(p); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status); return j; };
const LS = { get: (k, d) => { try { return JSON.parse(localStorage.getItem('ts:' + k)) ?? d; } catch { return d; } }, set: (k, v) => { localStorage.setItem('ts:' + k, JSON.stringify(v)); if (SYNC_KEYS.has(k)) AL.scheduleSync(); } };
const SYNC_KEYS = new Set(['watch', 'wallets', 'alerts']);

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

// ---------- Scope Score ----------
const gradeCls = g => ({ good: 'g', mid: 'y', weak: 'o', bad: 'r' })[g] || 'n';
const lblCls = l => /^(OK|LIKELY REAL)$/.test(l) ? 'g' : /^(NEUTRAL|PARTLY REAL)$/.test(l) ? 'y' : /SKETCHY/.test(l) ? 'o' : 'r';
function scoreChip(c) {
  if (!c) return '';
  return `<span class="chip sscore s-${gradeCls(c.g)}" title="${esc(`Scope Score ${c.t}/100 — Coin ${c.c ?? 'n/a'}${c.cl ? ' ' + c.cl : ''} · Narrative ${c.n} ${c.nl} (heuristic). ${c.r || ''} DYOR.`)}">${SCOPE_ICO}${c.t}</span>`;
}
function scorePanel(sc, addr, chain) {
  const ring = (v, cls, size = 64) => `<div class="sring s-${cls}" style="--v:${v};width:${size}px;height:${size}px"><b>${v}</b></div>`;
  const rows = items => items.map(i => `<div class="si ${i.level}"><div class="sil"><span>${esc(i.label)}</span><b class="mono">${esc(String(i.value))}</b></div><div class="sib"><i style="width:${i.max ? (i.points / i.max * 100).toFixed(0) : 0}%"></i></div><div class="sin"><span>${esc(i.note)}</span><span class="mono dim">${i.points}/${i.max}</span></div></div>`).join('');
  const c = sc.coin, n = sc.narrative;
  return `<div class="sc-top">${ring(sc.total, gradeCls(sc.grade), 72)}
    <div class="sc-mid"><div class="sc-t">Scope Score <span class="dim">/100</span>${glossLink}</div>
      <div class="sc-pills">${c ? `<span class="spill s-${lblCls(c.label)}">COIN ${c.score} · ${c.label}</span>` : `<span class="spill s-n">COIN n/a on this chain</span>`}<span class="spill s-${lblCls(n.label)}">NARRATIVE ${n.score} · ${n.label}</span></div>
      <div class="sc-r">${esc(sc.reason)}</div></div></div>
    <details class="sc-bd"><summary>Breakdown <span class="dim">· how we got ${sc.total}</span></summary>
      <div class="sc-cols">${c ? `<div><h4>Coin fairness <span class="dim">${c.score}/100 · 60% of total</span></h4>${rows(c.items)}${c.caps.length ? `<div class="sc-cap">⚠ ${c.caps.map(esc).join(' · ')}</div>` : ''}<div class="dim sc-src">Source: ${esc(c.source)}</div></div>` : ''}
      <div><h4>Narrative <span class="dim">${n.score}/100 · heuristic${c ? ' · 40% of total' : ''}</span></h4>${rows(n.items)}<div class="dim sc-src">Heuristic: checks links listed on DexScreener, whether the site loads, its domain age (RDAP) and GitHub activity. It can’t judge if the story is true.</div></div></div>
    </details>
    <div class="sc-disc">${esc(sc.disclaimer)} <span class="dim">· updated ${age(sc.computedAt)} ago · <a href="/api/score/${esc(chain)}/${esc(addr)}" target="_blank" rel="noopener">API</a></span></div>`;
}
async function loadScore(addr, chain) {
  const el = $('#scoreCard'); if (!el) return;
  try {
    const sc = await api(`/api/score/${chain}/${encodeURIComponent(addr)}`);
    if ($('#scoreCard') === el) el.innerHTML = scorePanel(sc, addr, chain);
  } catch (e) { if ($('#scoreCard') === el) el.innerHTML = `<div class="mut">Scope Score unavailable right now (${esc(e.message)}). <button class="tf" id="scRetry">Retry ↻</button></div>`; $('#scRetry')?.addEventListener('click', () => { el.innerHTML = scoreSkel; loadScore(addr, chain); }); }
}
const scoreSkel = `<div class="sc-top"><div class="sring s-n" style="--v:0;width:72px;height:72px"><b>…</b></div><div class="sc-mid"><div class="sc-t">Scope Score</div><div class="skel" style="width:240px;height:20px;margin:6px 0"></div><div class="dim" style="font-size:12px">Scanning holders, launch snipers, dev wallet, website, socials…</div></div></div>`;

// ---------- paid placements ----------
const SCOPE_ICO = '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 1.5v5M12 17.5v5M1.5 12h5M17.5 12h5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/></svg>';
const scopeTag = big => `<span class="chip scope" title="Scoped: the project paid for an enhanced profile and On the Scope reviewed the submitted info. This is a paid listing, not an endorsement — always check the safety score.">${SCOPE_ICO}${big ? ' Scoped' : ''}</span>`;
const promoTag = (n, big) => n ? `<span class="chip promo" title="Promoted: ${n} paid boosts active on this site. Paid placement — ranking raised in Trending.">⚡${big ? ' Promoted · ' : ''}${n}${big ? ' boosts' : ''}${big ? '' : ' AD'}</span>` : '';

// ---------- OG / VAMP ----------
const dt = ts => ts ? new Date(ts).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '?';
function ogTag(o, big) {
  if (!o) return '';
  if (o.status === 'og') return `<span class="chip og" title="${esc(`OG: first token with this name/ticker to graduate — earliest ${o.gradDex} pair ${dt(o.gradAt)}. ${o.vamps ? o.vamps + ' later vamp(s) reuse the name.' : 'No vamps found.'}${o.olderNonGraduated ? ' Note: ' + o.olderNonGraduated + ' same-name token(s) traded earlier on other DEXes without graduating.' : ''} Based on DexScreener-indexed pairs only.`)}">OG${big && o.vamps ? ` · ${o.vamps} vamp${o.vamps > 1 ? 's' : ''}` : ''}</span>`;
  const vvChip = o.vv ? `<span class="chip vv" title="${esc(`Valid Vamp: flipped the OG 5x+ — smoothed (4h median) market cap ${o.ratio.toFixed(1)}x ${o.og.symbol}'s, and at least 24h old. Lost if it falls back under 5x.`)}">VV${big ? ' · Valid Vamp ' + o.ratio.toFixed(1) + 'x' : ''}</span>` : '';
  if (o.status === 'vamp' && o.og) return vvChip + `<a class="chip vamp" href="/token/${o.og.mint}" data-link data-stop title="${esc(`Vamp: reused a name that already graduated earlier — ${o.og.symbol} (${short(o.og.mint)}) graduated first (${o.og.gradDex}, ${dt(o.og.gradAt)})${o.gradAt ? '; this one graduated ' + dt(o.gradAt) : '; this one has not graduated'}. Click to open the OG. Based on DexScreener-indexed pairs only.`)}">${big ? 'Vamp of ' + esc(o.og.symbol) + ' ↗' : 'VAMP'}</a>`;
  return '';
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
        if (!AL.remoteActive() && 'Notification' in window && Notification.permission === 'granted') new Notification('On the Scope alert', { body: msg.replace(/<[^>]+>/g, '') });
        alerts = alerts.filter(x => x.id !== a.id); changed = true;
      }
    }
    if (changed) { LS.set('alerts', alerts); renderAlertCount(); }
  } catch {}
}
setInterval(checkAlerts, 30000); checkAlerts();
AL.initAlerts({
  LS,
  getState: () => ({ watch: Object.entries(watch).map(([mint, w]) => ({ mint, symbol: w.symbol })), wallets: LS.get('wallets', []), targets: alerts }),
  onFired: ids => { const before = alerts.length; alerts = alerts.filter(a => !ids.includes(String(a.id))); if (alerts.length !== before) { localStorage.setItem('ts:alerts', JSON.stringify(alerts)); renderAlertCount(); } },
});
$('#alertsBtn').onclick = () => {
  const d = $('#drawer');
  if (!d.hidden) return (d.hidden = true);
  d.innerHTML = `<h3 style="margin:0 0 8px">Price alerts</h3><p class="mut" style="margin:0 0 10px;font-size:12px">${AL.remoteActive() ? 'Push/Telegram alerts are on — these fire even when the site is closed.' : 'Checked every 30s while this tab is open. <a href="/profile?tab=alerts" data-link style="color:var(--b)">Turn on push or Telegram →</a>'}</p>` +
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
  const mc = location.pathname.match(/^\/token\/([a-z0-9-]+)\/([^/]+)$/);
  const m = location.pathname.match(/^\/token\/([1-9A-HJ-NP-Za-km-z]{32,44})$/);
  window.scrollTo(0, 0);
  const o = location.pathname.match(/^\/order\/([a-f0-9]{20})$/);
  $('#profileBtn')?.classList.toggle('on', location.pathname === '/profile');
  if (mc) tokenPage(decodeURIComponent(mc[2]), mc[1]); else if (m) tokenPage(m[1]); else if (o) orderPage(o[1]); else if (location.pathname === '/advertise') advertisePage(); else if (location.pathname === '/profile') openProfile(); else listPage();
}

// ---------- profile (lazy-loaded module) ----------
async function openProfile() {
  app.innerHTML = '<div class="pf-head"><div class="pf-av skel"></div><div style="flex:1"><div class="skel" style="width:180px;height:20px"></div><div class="skel" style="width:260px;margin-top:8px"></div></div></div>';
  try {
    const { profilePage } = await import('./profile.js');
    if (location.pathname !== '/profile') return;
    profilePage({ app, $, esc, usd, price, pct, age, short, icon, api, LS, toast, watch, toggleWatch, go, cleanup, tokenHref });
  } catch (e) { app.innerHTML = `<div class="err">Couldn't load the profile: ${esc(e.message)}</div>`; }
}

// ---------- list page ----------
const TABS = [
  { id: 'trending', label: '🔥 Trending', desc: 'Hottest Solana pairs right now (GeckoTerminal trending + DexScreener boosts), enriched with live DexScreener stats.' },
  { id: 'new', label: '✨ New pairs', desc: 'Freshly created pools and newly listed token profiles, newest first.' },
  { id: 'gainers', label: '🚀 Gainers', desc: 'Biggest 24h movers with at least $5K liquidity across tracked pairs.' },
  { id: 'pumpfun', label: '<span class="dot"></span> Pump.fun live', desc: 'Coins currently live-streaming on pump.fun (bonding curve & migrated).' },
  { id: 'watch', label: '★ Watchlist', desc: 'Your starred tokens — saved locally in this browser.' },
];
const DEF = { chain: 'solana', tab: 'trending', liq: 0, vol: 0, mcapMin: 0, mcapMax: 0, age: 0, safeOnly: false, noBundle: false, ogOnly: false, vvOnly: false, smartOnly: false, sort: null, dir: -1 };
let st = { ...DEF, ...LS.get('filters', {}) };
const saveSt = () => LS.set('filters', st);
let rows = [], safetyMap = {}, ogMap = {}, scoreMap = {}, smMap = {}, lastUpdated = 0;
// ---------- smart money ----------
const myWallets = () => LS.get('wallets', []);
const wq = () => { const w = myWallets().map(x => x.addr).slice(0, 20); return w.length ? 'w=' + w.join(',') : ''; };
let smAt = 0;
async function loadSmart(force) {
  if (st.chain !== 'solana' && st.chain !== 'all') return;
  if (!force && Date.now() - smAt < 25000) return; smAt = Date.now();
  try { const d = await api('/api/smart?' + wq()); smMap = d.tokens || {}; draw(); } catch {}
}
const SM_ICO = '🧠';
function smChip(sm, big) {
  if (!sm) return '';
  const own = sm.mine && sm.mine.buys ? `<span class="chip smart mine" title="Your tracked wallet bought in the last 24h">👛 ${big ? 'Your wallet bought' : 'You'}</span>` : '';
  if (!sm.buyers?.length) return own;
  const names = sm.buyers.slice(0, 4).join(', ') + (sm.buyers.length > 4 ? ` +${sm.buyers.length - 4}` : '');
  return `<span class="chip smart" title="Smart money bought (24h): ${esc(names)}">${SM_ICO} ${big ? 'Smart money bought' : sm.buyers.length}${big ? ` · ${esc(names)}` : ''}</span>` + own;
}
let CHAINS = [{ id: 'solana', name: 'Solana', color: '#14f195' }];
const chainOf = id => id === 'all' ? { id: 'all', name: 'All chains', color: '#9aa4b8' } : (CHAINS.find(c => c.id === id) || { id, name: id, color: '#9aa4b8' });
const chainDot = (id, big) => { const c = chainOf(id); return `<span class="cdot${big ? ' big' : ''}" style="--c:${c.color}" title="${esc(c.name)}">${esc(c.name.replace(/[^A-Za-z]/g, '').slice(0, 2))}</span>`; };
const tokenHref = x => x.chain && x.chain !== 'solana' ? `/token/${x.chain}/${encodeURIComponent(x.mint)}` : `/token/${x.mint}`;
api('/api/chains').then(d => { CHAINS = d.chains; renderChainBtn(); }).catch(() => {});
function renderChainBtn() { const b = $('#chainBtn'); if (b) b.innerHTML = `${chainDot(st.chain)}<span class="cname">${esc(chainOf(st.chain).name)}</span><span class="dim">▾</span>`; }
function chainSheet() {
  $('#csheet')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div class="modal-bg sheet-bg" id="csheet"><div class="sheet"><div class="grab"></div><h2>Select chain</h2>
    <input id="cq" placeholder="Search chains…" autocomplete="off"><div class="clist" id="clist"></div></div></div>`);
  const draw = q => { const all = [{ id: 'all', name: 'All chains' }, ...CHAINS].filter(c => c.name.toLowerCase().includes(q.toLowerCase()));
    $('#clist').innerHTML = all.map(c => `<button class="crow ${c.id === st.chain ? 'on' : ''}" data-c="${c.id}">${chainDot(c.id, true)}<span>${esc(c.name)}</span>${c.id === st.chain ? '<span class="up" style="margin-left:auto">✓</span>' : ''}</button>`).join('') || '<div class="mut" style="padding:12px">No chain found</div>';
    $('#clist').querySelectorAll('[data-c]').forEach(b => b.onclick = () => { st.chain = b.dataset.c; if (st.chain !== 'solana' && !['trending', 'new', 'gainers'].includes(st.tab)) st.tab = 'trending'; saveSt(); $('#csheet').remove(); renderChainBtn(); if (location.pathname !== '/') go('/'); else listPage(); }); };
  draw(''); $('#cq').oninput = e => draw(e.target.value);
  $('#csheet').onclick = e => { if (e.target.id === 'csheet') $('#csheet').remove(); };
  setTimeout(() => $('#cq')?.focus(), 50);
}
document.addEventListener('click', e => { if (e.target.closest('#chainBtn')) chainSheet(); });

function filtered() {
  let r = rows.map(x => ({ ...x, safety: safetyMap[x.mint] || x.safety, og: ogMap[x.mint] || x.og, score: scoreMap[x.mint] || x.score }));
  const n = v => v ?? 0;
  if (st.liq) r = r.filter(x => n(x.liquidity) >= st.liq || (st.tab === 'pumpfun' && x.liquidity == null));
  if (st.vol) r = r.filter(x => n(x.volume?.h24) >= st.vol);
  if (st.mcapMin) r = r.filter(x => n(x.mcap || x.fdv) >= st.mcapMin);
  if (st.mcapMax) r = r.filter(x => n(x.mcap || x.fdv) <= st.mcapMax);
  if (st.age) r = r.filter(x => x.createdAt && Date.now() - x.createdAt <= st.age * 3600e3);
  if (st.safeOnly) r = r.filter(x => x.safety && !x.safety.unavailable && x.safety.grade === 'safe');
  if (st.noBundle) r = r.filter(x => !(x.safety && x.safety.bundled));
  if (st.ogOnly) r = r.filter(x => x.og && x.og.status === 'og');
  if (st.vvOnly) r = r.filter(x => x.og && x.og.vv);
  if (st.smartOnly) r = r.filter(x => smMap[x.mint]);
  if (st.sort) {
    const get = { price: x => x.priceUsd, age: x => -(x.createdAt || 0), m5: x => x.change?.m5, h1: x => x.change?.h1, h6: x => x.change?.h6, h24: x => x.change?.h24, vol: x => x.volume?.h24, liq: x => x.liquidity, mcap: x => x.mcap || x.fdv, txns: x => (x.txns?.h24?.buys || 0) + (x.txns?.h24?.sells || 0), safety: x => x.safety?.score ?? -1 }[st.sort];
    if (get) r.sort((a, b) => ((get(a) ?? -Infinity) - (get(b) ?? -Infinity)) * st.dir);
  }
  return r;
}
const sel = (key, label, opts) => `<label class="f">${label}<select data-k="${key}">${opts.map(([v, t]) => `<option value="${v}" ${+st[key] === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
const tog = (key, label) => `<button class="toggle ${st[key] ? 'on' : ''}" data-t="${key}"><span class="sw"></span>${label}</button>`;

function listPage() {
  document.title = 'On the Scope — Solana screener with safety on every row';
  if (st.chain !== 'solana' && !['trending', 'new', 'gainers'].includes(st.tab)) st.tab = 'trending';
  const tab = TABS.find(t => t.id === st.tab) || TABS[0];
  renderChainBtn();
  app.innerHTML = `
  <section class="hero"><div><h1>${tab.label.replace(/<[^>]+>/g, '')} <span class="mut" style="font-weight:500">on ${esc(chainOf(st.chain).name)}</span></h1><p>${tab.desc}</p></div>
  <div class="stats" id="stats"></div></section>
  <nav class="tabs">${TABS.filter(t => st.chain === 'solana' || ['trending', 'new', 'gainers'].includes(t.id)).map(t => `<button class="tab ${t.id === st.tab ? 'on' : ''}" data-tab="${t.id}">${t.label}${t.id === 'watch' ? ` <span class="chip">${Object.keys(watch).length}</span>` : ''}</button>`).join('')}</nav>
  <div class="bar"><div class="filters">
    ${tog('safeOnly', '🛡 Safe only')}${tog('ogOnly', '👑 OG only')}${tog('vvOnly', 'VV only')}${glossLink}${tog('smartOnly', '🧠 Smart money')}${tog('noBundle', 'Hide bundled')}
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
      const d = await api('/api/list/' + st.tab + (st.chain !== 'solana' ? '?chain=' + st.chain : ''));
      rows = d.rows; lastUpdated = d.updatedAt;
      for (const r of rows) { if (r.safety) safetyMap[r.mint] = r.safety; if (r.og) ogMap[r.mint] = r.og; if (r.score) scoreMap[r.mint] = r.score; }
    }
    draw(); pollSafety(); loadSmart(first);
  } catch (e) {
    if (first) { $('#tb').innerHTML = `<tr><td colspan="14" class="err">Couldn't load data: ${esc(e.message)}. Retrying…</td></tr>`; $('#cards').innerHTML = `<div class="err">Couldn't load data. Retrying…</div>`; }
  }
}
async function pollSafety() {
  if (st.chain !== 'solana') return;
  const need = rows.slice(0, 150).map(r => r.mint).filter(m => !safetyMap[m] || !ogMap[m] || !scoreMap[m]);
  if (!need.length) return;
  try {
    const { safety, og, score } = await api('/api/safety?mints=' + need.join(','));
    let n = 0;
    for (const [m, s] of Object.entries(safety)) if (!safetyMap[m]) { safetyMap[m] = s; n++; }
    for (const [m, o] of Object.entries(og || {})) if (!ogMap[m]) { ogMap[m] = o; n++; }
    for (const [m, c] of Object.entries(score || {})) if (!scoreMap[m] || scoreMap[m].t !== c.t) { scoreMap[m] = c; n++; }
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
    const msg = st.smartOnly && !Object.keys(smMap).length ? 'No smart-money buys tracked in the last 24h yet — the tracker checks 20 public KOL wallets + your wallets every minute or so.' : st.tab === 'watch' && !Object.keys(watch).length ? 'Your watchlist is empty. Tap ☆ on any token to track it here.' : st.safeOnly && scanned.length < rows.length ? 'No tokens pass the filters yet — safety scans are still running, give it a few seconds.' : 'No tokens match these filters.';
    tb.innerHTML = `<tr><td colspan="14" class="empty">${msg}</td></tr>`; $('#cards').innerHTML = `<div class="empty">${msg}</div>`; return;
  }
  const isNew = x => x.createdAt && Date.now() - x.createdAt < 86400e3;
  tb.innerHTML = r.slice(0, 200).map((x, i) => {
    const b = x.txns?.h24?.buys, s = x.txns?.h24?.sells, tot = (b || 0) + (s || 0);
    const L = links(x.mint, x.pair);
    return `<tr data-m="${x.mint}" data-h="${esc(tokenHref(x))}" class=""${x.promo ? 'promoted' : ''}">
      <td class="l"><button class="star ${isWatched(x.mint) ? 'on' : ''}" data-w="${x.mint}" title="Watchlist">${isWatched(x.mint) ? '★' : '☆'}</button></td>
      <td class="l"><div class="tok">${st.chain === 'all' ? chainDot(x.chain) : ''}${icon(x)}<div class="nm"><span class="sym">${esc(x.symbol)} ${x.scope ? scopeTag() : ''}${ogTag(x.og)}${smChip(smMap[x.mint])}${promoTag(x.promo)}${x.boosts ? `<span class="chip boost" title="Active DexScreener boosts (paid on DexScreener)">DS⚡${x.boosts}</span>` : ''}${isNew(x) ? '<span class="chip new">NEW</span>' : ''}</span><span class="sub">${esc(x.name)}${x.dex ? ' · ' + esc(x.dex) : ''}</span></div></div></td>
      <td class="l"><span class="safe">${badge(x.safety)}${scoreChip(x.score)}${pips(x.safety)}</span></td>
      <td class="mono">${price(x.priceUsd)}</td><td class="mut">${age(x.createdAt)}</td>
      <td>${tot ? `<div class="txbar"><span>${tot.toLocaleString()}</span><span class="b"><i style="width:${(b / tot * 100).toFixed(0)}%"></i></span></div>` : '<span class="dim">—</span>'}</td>
      <td>${usd(x.volume?.h24)}</td><td>${pct(x.change?.m5)}</td><td>${pct(x.change?.h1)}</td><td>${pct(x.change?.h6)}</td><td>${pct(x.change?.h24)}</td>
      <td>${usd(x.liquidity)}</td><td>${usd(x.mcap || x.fdv)}</td>
      <td><a class="buy" href="${x.chain && x.chain !== 'solana' ? `https://dexscreener.com/${x.chain}/${x.pair}` : L.jup}" target="_blank" rel="noopener" data-stop>${x.chain && x.chain !== 'solana' ? 'Trade' : 'Buy'}</a></td></tr>`;
  }).join('');
  $('#cards').innerHTML = r.slice(0, 100).map(x => `<div class="c" data-m="${x.mint}" data-h="${esc(tokenHref(x))}">
      <div class="tok" style="grid-column:1/3">${icon(x)}<div class="nm"><span class="sym">${esc(x.symbol)} ${x.scope ? scopeTag() : ''}${ogTag(x.og)}${smChip(smMap[x.mint])}${promoTag(x.promo)}${isNew(x) ? '<span class="chip new">NEW</span>' : ''}</span><span class="sub">${esc(x.name)} · ${age(x.createdAt)}</span></div></div>
      <div class="pr"><b class="mono">${price(x.priceUsd)}</b>${pct(x.change?.h24 ?? x.change?.h1)}</div>
      <div class="sf"><span class="safe">${badge(x.safety)}${scoreChip(x.score)}${pips(x.safety)}</span><span style="display:flex;gap:6px;align-items:center"><button class="star ${isWatched(x.mint) ? 'on' : ''}" data-w="${x.mint}">${isWatched(x.mint) ? '★' : '☆'}</button><a class="buy" href="${x.chain && x.chain !== 'solana' ? `https://dexscreener.com/${x.chain}/${x.pair}` : links(x.mint, x.pair).jup}" target="_blank" rel="noopener" data-stop>${x.chain && x.chain !== 'solana' ? 'Trade' : 'Buy'}</a></span></div>
      <div class="meta"><span>Liq <b>${usd(x.liquidity)}</b></span><span>Vol <b>${usd(x.volume?.h24)}</b></span><span>MCap <b>${usd(x.mcap || x.fdv)}</b></span><span>1h ${pct(x.change?.h1)}</span></div></div>`).join('');
  app.querySelectorAll('[data-m]').forEach(el => el.onclick = e => {
    if (e.target.closest('[data-stop]')) return;
    const w = e.target.closest('[data-w]');
    if (w) { const row = rows.find(z => z.mint === w.dataset.w); toggleWatch(row); if (st.tab === 'watch') load(); else draw(); return; }
    go(el.dataset.h || '/token/' + el.dataset.m);
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
let CUR_CHAIN = 'solana', CUR_MINT = '';
async function tokenPage(mint, chain = 'solana') {
  CUR_CHAIN = chain; CUR_MINT = mint; const isSol = chain === 'solana'; const cq = isSol ? '' : '?chain=' + chain;
  app.innerHTML = `<div class="tp-head"><div class="ico"></div><div style="flex:1"><div class="skel" style="width:200px;height:22px"></div><div class="skel" style="width:300px;margin-top:8px"></div></div></div><div class="kpis">${'<div class="kpi"><div class="skel"></div></div>'.repeat(4)}</div><div class="card" style="height:430px"></div>`;
  let d;
  try { d = await api('/api/token/' + encodeURIComponent(mint) + cq); } catch (e) { app.innerHTML = `<div class="err">Couldn't load token: ${esc(e.message)}</div><p style="text-align:center"><a href="/" data-link class="btn">← Back to screener</a></p>`; return; }
  const m = d.main || {}; const s = d.safety || {}; const L = links(mint, m.pair);
  document.title = `${d.symbol || short(mint)} ${m.priceUsd ? '· ' + price(m.priceUsd).replace(/<[^>]+>/g, '') : ''} — On the Scope`;
  const sv = !s.unavailable;
  const ringC = !sv ? 'var(--dim)' : s.grade === 'safe' ? 'var(--g)' : s.grade === 'caution' ? 'var(--y)' : 'var(--r)';
  const verdict = !sv ? '' : s.grade === 'safe' ? `<div class="verdict g">✓ No major red flags found. Still DYOR — memecoins are high risk.</div>` : s.grade === 'caution' ? `<div class="verdict y">⚠ Some risk factors — review the flags before aping.</div>` : `<div class="verdict r">⛔ High risk — serious red flags detected.</div>`;
  const socials = [...(m.websites || []).map(w => ({ label: w.label || 'Website', url: w.url })), ...(m.socials || []).map(x => ({ label: x.type, url: x.url }))].filter(x => safeUrl(x.url));
  const b24 = m.txns?.h24?.buys, s24 = m.txns?.h24?.sells;
  const sc = d.scope;
  const scLinks = sc ? [['Website', sc.website], ['X', sc.twitter], ['Telegram', sc.telegram]].filter(x => safeUrl(x[1])) : [];
  app.innerHTML = `
  <a href="/" data-link class="mut" style="font-size:13px">← Screener</a>
  ${sc && safeUrl(sc.banner) ? `<div class="banner" style="margin-top:10px"><img src="${esc(sc.banner)}" alt="" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"></div>` : ''}
  <div class="tp-head" style="margin-top:10px">${icon({ icon: (sc && safeUrl(sc.logo)) || d.icon, symbol: d.symbol })}
    <div><h1>${esc(d.symbol || '?')} <span class="mut" style="font-weight:500;font-size:16px">${esc(d.name || '')}</span> ${sv ? badge(s) : ''} ${sc ? scopeTag(true) : ''} ${ogTag(d.og, true)}${d.og && d.og.status !== 'none' ? glossLink : ''}${d.flippedBy?.length ? `<span class="chip vamp" title="Valid Vamp(s) have 5x+ this token's smoothed market cap">Flipped by ${esc(d.flippedBy[0].symbol || short(d.flippedBy[0].mint))}</span>` : ''} ${promoTag(d.promo, true)}</h1>
      <div class="addr"><span>${esc(short(mint))}</span><button class="copy" data-copy="${mint}">Copy CA</button>${m.dex ? `<span class="chip">${esc(m.dex)}</span>` : ''}${s.launchpad ? `<span class="chip">${esc(s.launchpad)}</span>` : ''}${m.createdAt ? `<span class="chip">Pair age ${age(m.createdAt)}</span>` : ''}${socials.map(x => `<a class="chip" href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.label)} ↗</a>`).join('')}</div></div>
    <div class="price-big" id="pbig" role="button" tabindex="0" title="Tap to switch Price ⇄ Market cap"></div>
  </div>
  ${sc ? `<div class="card scopecard"><div class="mut" style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin-bottom:6px">${SCOPE_ICO} Project info · submitted by the team, reviewed by On the Scope</div><p style="margin:0 0 8px;white-space:pre-wrap">${esc(sc.description)}</p>${scLinks.map(([l, u]) => `<a class="chip" href="${esc(u)}" target="_blank" rel="noopener nofollow">${l} ↗</a>`).join(' ')}</div>` : ''}
  <div class="actions">
    ${isSol ? `<a class="btn pri" id="buyBtn" href="${L.jup}" target="_blank" rel="noopener">⚡ Buy</a>
    <a class="btn ss" href="${L.safesign}" target="_blank" rel="noopener">🛡 Deep scan on SafeSign</a>
    <button class="btn" id="wbtn">${isWatched(mint) ? '★ Watching' : '☆ Watchlist'}</button>` : `<span class="chip">${chainDot(chain)} ${esc(chainOf(chain).name)}</span>`}
    <a class="btn ${isSol ? '' : 'pri'}" href="https://dexscreener.com/${chain}/${m.pair || mint}" target="_blank" rel="noopener">${isSol ? 'DexScreener ↗' : 'Trade on DexScreener ↗'}</a>
    ${isSol ? `<a class="btn" href="${L.solscan}" target="_blank" rel="noopener">Solscan ↗</a>
    <a class="btn" href="${L.rug}" target="_blank" rel="noopener">RugCheck ↗</a>` : ''}
    ${d.pump ? `<a class="btn" href="${L.pump}" target="_blank" rel="noopener">pump.fun ↗</a>` : ''}
    ${isSol ? '' : '<!--'}<a class="btn gold" href="/advertise?mint=${mint}" data-link>${sc ? '⚡ Boost' : SCOPE_ICO + ' Get Scoped / Boost'}</a>${isSol ? '' : '-->'}
  </div>
  ${isSol ? '<div class="smstrip" id="smStrip"></div>' : ''}
  <div class="card scorecard" id="scoreCard">${scoreSkel}</div>
  ${isSol ? `<div class="card buycard" id="buyCard"><div class="buy-head"><div><b>⚡ Buy ${esc(d.symbol || 'this token')} here</b><div class="dim">Swap SOL → ${esc(d.symbol || 'token')} with Jupiter. Your wallet signs; we never hold funds.</div></div><button class="btn pri" id="buyOpen">Open swap</button></div>
    <div id="jupiter-plugin" class="buy-body" hidden></div>
    <div class="buy-foot dim"><span id="buyFee"></span> <a href="${L.jup}" target="_blank" rel="noopener">Buy on Jupiter ↗</a></div></div>` : ''}
  <div class="kpis">
    <div class="kpi"><small>Market cap</small><b>${usd(m.mcap ?? d.pump?.usdMcap)}</b><span class="dim" style="font-size:12px">FDV ${usd(m.fdv)}</span></div>
    <div class="kpi"><small>Liquidity</small><b>${usd(m.liquidity)}</b><span class="dim" style="font-size:12px">${m.liquidity && m.mcap ? 'Liq/MCap ' + (m.liquidity / m.mcap * 100).toFixed(1) + '%' : '&nbsp;'}</span></div>
    <div class="kpi"><small>Volume 24h</small><b>${usd(m.volume?.h24)}</b><span class="dim" style="font-size:12px">1h ${usd(m.volume?.h1)}</span></div>
    <div class="kpi"><small>Holders</small><b>${s.holders != null ? s.holders.toLocaleString() : '—'}</b><span class="dim" style="font-size:12px">${b24 != null ? `24h <span class="up">${b24.toLocaleString()} buys</span> / <span class="dn">${s24.toLocaleString()} sells</span>` : '&nbsp;'}</span></div>
  </div>
  <div class="grid">
    <div class="stack">
      <div class="card chartcard"><div class="chart-top">${['1m', '5m', '15m', '1h', '4h', '1d'].map(t => `<button class="tf" data-tf="${t}">${t}</button>`).join('')}<span class="dim" id="chartSrc" style="margin-left:auto;font-size:12px">${m.pair ? 'GeckoTerminal OHLCV · USD' : ''}</span></div><div id="chart">${m.pair ? '' : '<div class="empty">No trading pair found yet.</div>'}</div>
        <div class="chg-row">${['m5', 'h1', 'h6', 'h24'].map(k => `<div><small>${k.replace('m', '').replace('h', '')}${k[0]}</small>${pct(m.change?.[k])}</div>`).join('')}</div></div>
      <div class="card trades"><h3>Recent trades <span class="r" id="trUpd"></span></h3><div class="scroll" id="trades"><div class="skel"></div></div></div>
      ${d.pairs?.length > 1 ? `<div class="card"><h3>Pools</h3><div class="scroll"><table style="min-width:520px"><thead><tr><th class="l">DEX</th><th class="l">Pair</th><th>Price</th><th>Liquidity</th><th>Vol 24h</th></tr></thead><tbody>${d.pairs.map(p => `<tr onclick="window.open('${links(mint, p.pair).dex}','_blank')"><td class="l">${esc(p.dex)}</td><td class="l mono dim">${esc(short(p.pair))} · ${esc(p.quote)}</td><td class="mono">${price(p.priceUsd)}</td><td>${usd(p.liquidity)}</td><td>${usd(p.volume?.h24)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
    </div>
    ${isSol ? `    <div class="stack">
      <div class="card"><h3>🛡 Safety <span class="r">RugCheck + GoPlus</span></h3>
        ${sv ? `<div class="score-ring"><div class="ring" style="--v:${s.score};--c:${ringC}"><span style="color:${ringC}">${s.score}</span></div><div><div style="font-weight:800;font-size:16px;text-transform:capitalize">${s.grade === 'safe' ? 'Looks clean' : s.grade === 'caution' ? 'Caution' : 'High risk'}</div><div class="mut" style="font-size:12px">On the Scope score /100</div><div style="margin-top:6px">${pips(s)}</div></div></div>
        <div class="flags">${s.flags.map(f => `<div class="flag ${f.level}"><i></i><div><b>${esc(f.title)}</b><p>${esc(f.detail)}</p></div></div>`).join('')}</div>${verdict}` : `<div class="mut">Safety data unavailable right now${s.error ? ' (' + esc(s.error) + ')' : ''}. Try the <a href="${L.safesign}" target="_blank" style="color:var(--b)">SafeSign deep scan</a>.</div>`}
      </div>
      <div class="card"><h3>🧨 Bundle / sniper check</h3>${sv ? `
        <dl class="kv"><dt>Verdict</dt><dd class="${s.bundled ? 'dn' : 'up'}">${s.bundled ? 'Likely bundled / sniped' : 'No strong bundle signal'}</dd>
        <dt>Linked wallet clusters</dt><dd>${s.insiderClusters}</dd><dt>Largest cluster</dt><dd>${s.biggestCluster ? s.biggestCluster + ' wallets' : '—'}</dd>
        <dt>Supply held by clusters</dt><dd>${s.insiderPct != null ? s.insiderPct.toFixed(1) + '%' : '—'}</dd></dl>
        <p class="dim" style="font-size:11px;margin:10px 0 0">Heuristic from RugCheck's wallet transfer graph: groups of wallets funded/linked together that still hold supply. Huge (>200 wallet) graphs are ignored as exchange noise.</p>` : '<div class="mut">Unavailable.</div>'}</div>
      <div class="card"><h3>👑 OG check ${glossLink}<span class="r">name/ticker originality</span></h3>${ogCard(d.og, d.symbol, d.flippedBy)}</div>
      <div class="card"><h3>👤 Dev wallet</h3>${d.dev ? `<dl class="kv">
        <dt>Creator</dt><dd><a class="mono" style="color:var(--b)" href="https://solscan.io/account/${esc(d.dev.address)}" target="_blank" rel="noopener">${esc(short(d.dev.address))} ↗</a></dd>
        <dt>Holds of supply</dt><dd class="${d.dev.holdingPct > 5 ? 'dn' : ''}">${d.dev.holdingPct != null ? d.dev.holdingPct.toFixed(2) + '%' : '—'}</dd>
        <dt>SOL balance</dt><dd>${d.dev.solBalance != null ? d.dev.solBalance.toLocaleString(undefined, { maximumFractionDigits: 3 }) + ' SOL' : '—'}</dd>
        <dt>Other tokens created</dt><dd>${d.dev.otherTokens != null ? d.dev.otherTokens : '—'}</dd></dl>` : '<div class="mut">Creator not reported by data sources.</div>'}</div>
      <div class="card"><h3>👥 Holder concentration <span class="r">${s.top10 != null ? 'Top 10: ' + s.top10.toFixed(1) + '%' : ''}</span></h3>${sv && s.topHolders?.length ? s.topHolders.slice(0, 10).map(h => `<div class="hbar ${h.insider ? 'ins' : ''}"><a class="w" href="https://solscan.io/account/${esc(h.owner)}" target="_blank" rel="noopener">${esc(short(h.owner))}</a><div class="t"><i style="width:${Math.min(100, h.pct * 3)}%"></i></div><span class="mono" style="width:50px;text-align:right">${h.pct.toFixed(2)}%</span></div>`).join('') + `<p class="dim" style="font-size:11px;margin:8px 0 0">Excludes AMM pools, lockers and known program accounts. Red = flagged insider.</p>` : '<div class="mut">No holder data.</div>'}</div>
      <div class="card"><h3>🔔 Price alert</h3><form class="alertform" id="alertForm"><select id="adir"><option value="above">Above</option><option value="below">Below</option></select><input id="aprice" inputmode="decimal" placeholder="${m.priceUsd ? 'e.g. ' + (+(m.priceUsd * 1.5).toPrecision(3)) : 'price USD'}" required><button class="btn pri" style="padding:8px 12px">Set</button></form>
        <div id="myAlerts" style="margin-top:8px"></div></div>
    </div>` : `<div class="stack"><div class="card"><h3>🛡 Safety & intel</h3><div class="mut">Safety score, OG/VAMP, dev wallet, holders and alerts are Solana-only for now. Trading data for ${esc(chainOf(chain).name)} comes from DexScreener and GeckoTerminal.</div></div></div>`}
  </div>`;
  const mc = m.mcap ?? m.fdv ?? d.pump?.usdMcap ?? null;
  const drawBig = () => {
    const showMc = LS.get('bigMode', 'price') === 'mcap' && mc != null;
    $('#pbig').innerHTML = `<b class="mono">${showMc ? usd(mc) : price(m.priceUsd)}</b>${pct(m.change?.h24)} <span class="dim">24h</span><div class="pb-hint">${showMc ? '<u>MCap</u> ⇄ Price' : '<u>Price</u> ⇄ MCap'}</div>`;
  };
  drawBig();
  $('#pbig').onclick = () => { LS.set('bigMode', LS.get('bigMode', 'price') === 'mcap' ? 'price' : 'mcap'); drawBig(); };
  $('#pbig').onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#pbig').click(); } };
  app.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => { navigator.clipboard?.writeText(b.dataset.copy); b.textContent = 'Copied ✓'; setTimeout(() => (b.textContent = 'Copy CA'), 1500); });
  if ($('#wbtn')) $('#wbtn').onclick = () => { toggleWatch({ mint, symbol: d.symbol, icon: d.icon }); $('#wbtn').textContent = isWatched(mint) ? '★ Watching' : '☆ Watchlist'; };
  const drawMy = () => { const mine = alerts.filter(a => a.mint === mint); $('#myAlerts').innerHTML = mine.map(a => `<div class="al"><span class="mut">${a.dir}</span><span class="mono">${price(a.price)}</span><button class="x" data-del="${a.id}">✕</button></div>`).join(''); $('#myAlerts').querySelectorAll('[data-del]').forEach(b => b.onclick = () => { alerts = alerts.filter(a => a.id != b.dataset.del); LS.set('alerts', alerts); renderAlertCount(); drawMy(); }); };
  if ($('#myAlerts')) drawMy();
  if ($('#alertForm')) $('#alertForm').onsubmit = e => {
    e.preventDefault(); const p = parseFloat($('#aprice').value); if (!(p > 0)) return;
    alerts.push({ id: Date.now(), mint, symbol: d.symbol, dir: $('#adir').value, price: p }); LS.set('alerts', alerts); renderAlertCount(); drawMy(); $('#aprice').value = '';
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    toast(`Alert set: ${esc(d.symbol)} ${$('#adir').value} ${price(p)}`);
  };
  loadScore(mint, chain);
  if (isSol) setupBuy(mint, d.symbol);
  if (isSol) { loadSmartToken(mint); const smi = setInterval(() => loadSmartToken(mint), 30000); cleanup.push(() => clearInterval(smi)); }
  if (m.pair) {
    initChart(m.pair, m.priceUsd);
    loadTrades(m.pair, d.symbol); const iv = setInterval(() => loadTrades(m.pair, d.symbol), 20000); cleanup.push(() => clearInterval(iv));
  } else $('#trades').innerHTML = '<div class="mut">No pool yet.</div>';
}
function ogCard(o, sym, flipped) {
  if (!o) return '<div class="mut">Not checked yet (search sources busy) — reload in a minute.</div>';
  const note = `<p class="dim" style="font-size:11px;margin:10px 0 0">Compares Solana tokens with the same normalized name (case, spaces, emojis, suffixes like “coin”/“.fun” ignored) or same ticker + overlapping name. OG = earliest first Raydium/PumpSwap pair (pump.fun graduation venue). Only tokens DexScreener search returns are considered (${o.size} found, ${o.graduatedCount} graduated).</p>`;
  const v = o.status === 'og' ? `<span style="color:var(--gold)">OG — graduated first</span>` : o.status === 'vamp' ? `<span class="dn">VAMP — reused a name that already graduated earlier</span>` : '<span class="mut">No graduated token with this name found</span>';
  return `<dl class="kv"><dt>Verdict</dt><dd>${v}</dd>
    <dt>This token graduated</dt><dd>${o.gradAt ? dt(o.gradAt) + ' · ' + esc(o.gradDex) : 'Not yet (no Raydium/PumpSwap pair)'}</dd>
    ${o.status === 'vamp' && o.og ? `<dt>OG token</dt><dd><a href="/token/${o.og.mint}" data-link style="color:var(--gold)">${esc(o.og.symbol)} · ${esc(short(o.og.mint))} ↗</a></dd><dt>OG graduated</dt><dd>${dt(o.og.gradAt)} · ${esc(o.og.gradDex)}</dd>` : ''}
    ${o.status === 'og' ? `<dt>Vamps found</dt><dd>${o.vamps}</dd>` : ''}
    ${o.status === 'vamp' ? `<dt>Valid Vamp (VV)</dt><dd>${o.vv ? `<span class="up">Yes — ${o.ratio.toFixed(1)}x the OG</span>` : o.ratio ? `No — ${o.ratio.toFixed(2)}x the OG${o.ageOk ? '' : ', under 24h old'}` : 'Not enough mcap history yet'}</dd>` : ''}
    ${flipped?.length ? `<dt>Flipped by</dt><dd>${flipped.map(f => `<a href="/token/${f.mint}" data-link class="chip vv">${esc(f.symbol || short(f.mint))} ${f.ratio.toFixed(1)}x</a>`).join(' ')}</dd>` : ''}
    ${o.olderNonGraduated ? `<dt>Older non-pump tokens</dt><dd class="mut">${o.olderNonGraduated} traded earlier on other DEXes</dd>` : ''}
    <dt>Same-name tokens indexed</dt><dd>${o.size}</dd></dl>${note}`;
}
// ---------- buy on site ----------
function setupBuy(mint, sym) {
  const card = $('#buyCard'); if (!card) return;
  cleanup.push(() => BUY.unmount());
  BUY.feeNote().then(t => { if ($('#buyFee')) $('#buyFee').textContent = t; });
  let opened = false;
  const open = async scroll => {
    if (scroll) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (opened) return; opened = true;
    const body = $('#jupiter-plugin'), btn = $('#buyOpen');
    body.hidden = false; body.innerHTML = '<div class="skel" style="height:420px"></div>'; btn.textContent = 'Loading…'; btn.disabled = true;
    try {
      body.innerHTML = '';
      await BUY.mountBuy('jupiter-plugin', { mint, onSuccess: tx => toast(`✓ Bought ${esc(sym || '')} · <a href="https://solscan.io/tx/${esc(tx)}" target="_blank" rel="noopener" style="color:var(--b)">view tx</a>`) });
      btn.remove(); LS.set('buyOpen', true);
    } catch (e) {
      opened = false; body.innerHTML = `<div class="mut" style="padding:10px 0">Couldn't load the swap here (${esc(e.message)}). Use <b>Buy on Jupiter ↗</b> below instead.</div>`; btn.textContent = 'Retry'; btn.disabled = false;
    }
  };
  $('#buyOpen').onclick = () => open(false);
  BUY.config().then(c => {
    if (!c.plugin) { card.remove(); return; } // fall back to the plain jup.ag link
    const b = $('#buyBtn'); if (b) b.onclick = e => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); open(true); };
    if (LS.get('buyOpen', false)) open(false); // they used it before: show it straight away
  });
}
let KNOWN = new Map();
async function loadSmartToken(mint) {
  const el = $('#smStrip'); if (!el) return;
  try {
    const d = await api('/api/smart/' + mint + '?' + wq());
    KNOWN = new Map((d.known || []).map(k => [k.addr, k]));
    const mine = new Map(myWallets().map(w => [w.addr, w.label]));
    const ev = (d.events || []).slice(0, 8);
    const who = e => KNOWN.get(e.wallet)?.label || (mine.has(e.wallet) ? (mine.get(e.wallet) || short(e.wallet)) + ' (you)' : short(e.wallet));
    if (!$('#smStrip')) return;
    el.innerHTML = d.buyers?.length || d.mine ? `<details class="card smcard"><summary>${smChip(d, true)}<span class="dim sm-ago">${age(Math.min(d.last, Date.now()))} ago</span><span class="sm-more">details</span></summary>
      <div class="sm-list">${ev.map(e => `<a class="sm-ev" href="https://solscan.io/tx/${esc(e.sig)}" target="_blank" rel="noopener"><b class="${e.side === 'buy' ? 'up' : 'dn'}">${e.side === 'buy' ? 'BUY' : 'SELL'}</b><span>${esc(who(e))}</span><span class="mono">${e.sol ? e.sol.toFixed(2) + ' SOL' : e.usd ? usd(e.usd) : ''}</span><span class="dim">${age(e.at)}</span></a>`).join('')}</div>
      <p class="dim sm-note">${SM_ICO} Smart money = ${d.tracked} public KOL wallets (sources cited in <code>data/smart-wallets.js</code>) plus the wallets you track. Last ${d.windowHours}h. Following KOLs is not a strategy — they dump on followers too.</p></details>`
      : `<div class="smnone dim">${SM_ICO} No smart-money trades in the last ${d.windowHours}h · watching ${d.tracked} KOL wallets${mine.size ? ` + your ${mine.size}` : ''}</div>`;
  } catch { el.innerHTML = ''; }
}
async function loadTrades(pool, sym) {
  try {
    const { rows } = await api('/api/trades/' + encodeURIComponent(pool) + (CUR_CHAIN !== 'solana' ? '?chain=' + CUR_CHAIN : CUR_MINT ? '?mint=' + CUR_MINT : ''));
    const el = $('#trades'); if (!el) return;
    $('#trUpd').textContent = 'live · 20s';
    if (CUR_CHAIN === 'solana' && KNOWN.size && rows.some(t => KNOWN.has(t.wallet)) && !$('#smStrip .smcard')) loadSmartToken(CUR_MINT);
    el.innerHTML = rows.length ? `<table><thead><tr><th class="l">Time</th><th class="l">Type</th><th>USD</th><th>${esc(sym)}</th><th>Price</th><th class="l">Wallet</th></tr></thead><tbody>${rows.slice(0, 25).map(t => `<tr ${CUR_CHAIN === 'solana' ? `onclick="window.open('https://solscan.io/tx/${esc(t.tx)}','_blank')"` : ''}><td class="l dim">${age(Date.parse(t.at))} ago</td><td class="l ${t.kind === 'buy' ? 'up' : 'dn'}" style="font-weight:700">${t.kind === 'buy' ? 'Buy' : 'Sell'}</td><td class="${t.kind === 'buy' ? 'up' : 'dn'}">${usd(t.usd, 2)}</td><td class="mono">${t.tokenAmount != null ? Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 }).format(t.tokenAmount) : '—'}</td><td class="mono">${price(t.price)}</td><td class="l mono"><a style="color:var(--b)" href="https://solscan.io/account/${esc(t.wallet)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${KNOWN.has(t.wallet) ? `<span class="chip smart" title="Public KOL wallet">${SM_ICO} ${esc(KNOWN.get(t.wallet).label)}</span>` : esc(short(t.wallet))}</a></td></tr>`).join('')}</tbody></table>` : '<div class="mut">No recent trades reported.</div>';
  } catch (e) { const el = $('#trades'); if (el && !el.querySelector('table')) el.innerHTML = `<div class="mut">Trades unavailable (${esc(e.message)}).</div>`; }
}
const candleCache = {};
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
  const overlay = html => { $('#nochart')?.remove(); if (html) el.insertAdjacentHTML('beforeend', `<div class="chart-ov" id="nochart">${html}</div>`); };
  const skel = '<div class="chart-skel"><div class="skel" style="height:100%;border-radius:0;opacity:.35"></div><span>Loading chart…</span></div>';
  let fallbackShown = false;
  const showFallback = msg => {
    if (fallbackShown) return; fallbackShown = true; const lb = $('#chartSrc'); if (lb) lb.textContent = 'DexScreener chart (fallback)';
    overlay(`<iframe src="https://dexscreener.com/${CUR_CHAIN}/${pool}?embed=1&loadChartSettings=0&trades=0&tabs=0&info=0&chartLeftToolbar=0&chartTheme=dark&theme=dark&chartStyle=1&chartType=usd&interval=${({ '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240, '1d': '1D' })[tf]}" title="DexScreener chart" loading="lazy" referrerpolicy="no-referrer" style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>
      <div class="fb-note">Fallback chart (DexScreener) · ${esc(msg)} <button class="tf" id="retryChart">Retry ↻</button></div>`);
    $('#retryChart').onclick = () => { fallbackShown = false; load(true, 0); };
  };
  const draw = (candles, fit) => {
    cs.setData(candles); vs.setData(candles.map(c => ({ time: c.time, value: c.volume, color: c.close >= c.open ? 'rgba(20,241,149,.35)' : 'rgba(255,77,106,.35)' })));
    if (fit) chart.timeScale().fitContent();
  };
  const load = async (fit, attempt = 0) => {
    app.querySelectorAll('[data-tf]').forEach(b => b.classList.toggle('on', b.dataset.tf === tf));
    const key = CUR_CHAIN + ':' + pool + ':' + tf; const mine = tf;
    if (fit) { if (candleCache[key]) { draw(candleCache[key], true); overlay(''); } else if (!fallbackShown) overlay(skel); }
    try {
      const r = await fetch(`/api/ohlcv/${encodeURIComponent(pool)}?tf=${tf}${CUR_CHAIN !== 'solana' ? '&chain=' + CUR_CHAIN : ''}`); const j = await r.json().catch(() => ({}));
      if (mine !== tf) return;
      if (!r.ok) throw Object.assign(new Error(j.error || 'HTTP ' + r.status), { fallback: j.fallback });
      if (!j.candles.length) { if (fit) showFallback('no candles from GeckoTerminal yet'); return; }
      candleCache[key] = j.candles; fallbackShown = false; overlay(''); draw(j.candles, fit);
      const lbl = $('#chartSrc'); if (lbl) lbl.textContent = `GeckoTerminal OHLCV · USD${j.cachedAgeSec > 60 ? ' · cached ' + Math.round(j.cachedAgeSec / 60) + 'm ago' : ''}`;
    } catch (e) {
      if (mine !== tf) return;
      if (candleCache[key]) return; // keep showing what we have
      if (attempt < 1) { setTimeout(() => load(fit, attempt + 1), 2500); return; }
      showFallback('native chart rate-limited, retrying in background');
      setTimeout(() => { if (fallbackShown && mine === tf) { fallbackShown = true; load(false, 1).then(() => {}); } }, 20000);
    }
  };
  app.querySelectorAll('[data-tf]').forEach(b => b.onclick = () => { tf = b.dataset.tf; LS.set('tf', tf); load(true); });
  load(true);
  const iv = setInterval(() => load(false), 45000);
  cleanup.push(() => { clearInterval(iv); chart.remove(); });
}

// ---------- advertise ----------
const DS_PRICES = { scope: 299, boost10: 99, boost30: 249, boost100: 899 };
const DS_HOURS = { boost10: 12, boost30: 12, boost100: 24 };
async function advertisePage() {
  document.title = 'Advertise — On the Scope';
  const pre = new URLSearchParams(location.search).get('mint') || '';
  let P; try { P = await api('/api/pricing'); } catch (e) { app.innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }
  const pr = Object.fromEntries(P.products.map(p => [p.id, p]));
  const sel0 = new URLSearchParams(location.search).get('product') || 'scope';
  app.innerHTML = `
  <section class="hero"><div><h1>Advertise with On the Scope</h1><p>Same placements as DexScreener at a fraction of the price — paid in USDC or SOL with Solana Pay, verified on-chain. Every paid placement is labelled.</p></div></section>
  <div class="plans">
    <div class="plan feat"><div class="pn">${SCOPE_ICO} Scoped</div><div class="pp">$${pr.scope.priceUsd}<small> one-time</small></div><div class="pv">DexScreener Enhanced Token Info: <s>$${DS_PRICES.scope}</s> · save ${Math.round((1 - pr.scope.priceUsd / DS_PRICES.scope) * 100)}%</div>
      <ul><li>Logo, banner & description on the token page</li><li>Website / X / Telegram links</li><li>“Scoped” crosshair badge in every table</li><li>Reviewed by us before it goes live (usually &lt; 12h)</li></ul><button class="btn pri" data-pick="scope">Get Scoped</button></div>
    ${['boost10', 'boost30', 'boost100'].map(id => `<div class="plan"><div class="pn">⚡ ${pr[id].name}</div><div class="pp">$${pr[id].priceUsd}<small> / ${pr[id].hours}h</small></div><div class="pv">DexScreener ${pr[id].boosts}x: <s>$${DS_PRICES[id]}</s> / ${DS_HOURS[id]}h · save ${Math.round((1 - pr[id].priceUsd / DS_PRICES[id]) * 100)}%</div>
      <ul><li>Pinned higher in 🔥 Trending, ordered by active boosts</li><li>⚡ “Promoted” label on rows and token page</li><li>Stacks with other boosts</li><li>Starts instantly after on-chain confirmation</li></ul><button class="btn" data-pick="${id}">Boost ${pr[id].boosts}x</button></div>`).join('')}
  </div>
  <div class="card" style="margin:16px 0"><h3>Price comparison</h3><div class="scroll"><table style="min-width:560px"><thead><tr><th class="l">Product</th><th>On the Scope</th><th>DexScreener*</th><th>You save</th></tr></thead><tbody>
    ${['scope', 'boost10', 'boost30', 'boost100'].map(id => `<tr><td class="l">${id === 'scope' ? 'Scoped (vs Enhanced Token Info)' : pr[id].name + ' · ' + pr[id].hours + 'h'}</td><td class="up" style="font-weight:700">$${pr[id].priceUsd}</td><td class="mut">$${DS_PRICES[id]}${DS_HOURS[id] ? ' · ' + DS_HOURS[id] + 'h' : ''}</td><td>${Math.round((1 - pr[id].priceUsd / DS_PRICES[id]) * 100)}%</td></tr>`).join('')}
  </tbody></table></div><p class="dim" style="font-size:11px;margin:10px 0 0">*DexScreener Enhanced Token Info lists at $299. DexScreener only shows boost prices inside its Boost dialog; boost figures here are the commonly reported prices — check dexscreener.com for current pricing. Boosts are not available for tokens our scanner rates high-risk. Payments are non-refundable once a placement is live; rejected Scoped submissions are refunded to the paying wallet.</p></div>
  <div class="card" id="orderCard"><h3>Place an order</h3>
    <form id="orderForm" class="oform">
      <label>Product<select name="product">${P.products.map(p => `<option value="${p.id}" ${p.id === sel0 ? 'selected' : ''}>${esc(p.name)} — $${p.priceUsd}${p.hours ? ' / ' + p.hours + 'h' : ''}</option>`).join('')}</select></label>
      <label>Token address (Solana mint)<input name="mint" required value="${esc(pre)}" placeholder="e.g. DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" pattern="[1-9A-HJ-NP-Za-km-z]{32,44}"></label>
      <div id="scopeFields" class="oform">
        <label>Logo URL (https, square)<input name="logo" placeholder="https://…/logo.png"></label>
        <label>Banner URL (https, 3:1)<input name="banner" placeholder="https://…/banner.png"></label>
        <label class="full">Description<textarea name="description" rows="3" maxlength="600" placeholder="What is the project? (20–600 chars)"></textarea></label>
        <label>Website<input name="website" placeholder="https://"></label><label>X / Twitter<input name="twitter" placeholder="https://x.com/…"></label>
        <label>Telegram<input name="telegram" placeholder="https://t.me/…"></label><label>Contact (optional, for review questions)<input name="contact" placeholder="@telegram or email"></label>
      </div>
      <button class="btn pri full">Continue to payment →</button><div id="oerr" class="dn full"></div>
    </form></div>`;
  const form = $('#orderForm');
  const sync = () => { $('#scopeFields').style.display = form.product.value === 'scope' ? '' : 'none'; };
  form.product.onchange = sync; sync();
  app.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { form.product.value = b.dataset.pick; sync(); $('#orderCard').scrollIntoView({ behavior: 'smooth' }); form.mint.focus(); });
  form.onsubmit = async e => {
    e.preventDefault(); $('#oerr').textContent = '';
    const body = Object.fromEntries(new FormData(form)); const btn = form.querySelector('button.pri'); btn.disabled = true; btn.textContent = 'Creating order…';
    try {
      const r = await fetch('/api/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error);
      sessionStorage.setItem('order:' + j.id, JSON.stringify(j.options)); LS.set('orders', [...new Set([j.id, ...LS.get('orders', [])])].slice(0, 20));
      go('/order/' + j.id);
    } catch (err) { $('#oerr').textContent = err.message; btn.disabled = false; btn.textContent = 'Continue to payment →'; }
  };
}
async function orderPage(id) {
  document.title = 'Order — On the Scope';
  let qrs = {}; try { (JSON.parse(sessionStorage.getItem('order:' + id)) || []).forEach(o => qrs[o.currency] = o.qr); } catch {}
  const render = o => {
    (o.options || []).forEach(op => { if (op.qr) qrs[op.currency] = op.qr; });
    const names = { scope: 'Scoped', boost10: '10x Boost', boost30: '30x Boost', boost100: '100x Boost' };
    const status = { pending: '⏳ Waiting for payment', review: '✅ Paid — under review (usually < 12h)', approved: '✅ Live on the token page', rejected: 'Rejected' + (o.reviewNote ? ': ' + esc(o.reviewNote) : ''), active: `⚡ Boost active until ${new Date(o.endsAt).toLocaleString()}`, expired: 'Expired — no payment received' }[o.status] || o.status;
    app.innerHTML = `<a href="/advertise" data-link class="mut" style="font-size:13px">← Advertise</a>
    <section class="hero"><div><h1>${names[o.product] || o.product} · $${o.priceUsd}</h1><p>Token <a href="/token/${o.mint}" data-link class="mono" style="color:var(--b)">${short(o.mint)}</a> · order <span class="mono">${o.id}</span></p></div></section>
    <div class="card" style="margin-bottom:16px"><b style="font-size:16px">${status}</b>${o.payment ? `<p class="mut" style="margin:6px 0 0">Received ${o.payment.amount} ${o.payment.currency} · <a style="color:var(--b)" target="_blank" rel="noopener" href="https://solscan.io/tx/${esc(o.payment.signature)}">view transaction ↗</a></p>` : ''}</div>
    ${o.status === 'pending' ? `<div class="plans">${o.options.map(op => `<div class="plan" style="text-align:center"><div class="pn">Pay with ${op.currency}</div><div class="pp" style="font-size:22px">${op.amount} ${op.currency}</div>${qrs[op.currency] ? `<img src="${qrs[op.currency]}" width="220" height="220" style="border-radius:12px;background:#fff;margin:10px auto;display:block" alt="Solana Pay QR">` : ''}<a class="btn pri" href="${esc(op.url)}">Open in wallet</a><p class="dim" style="font-size:11px">Scan with Phantom/Solflare/Backpack. ${op.currency === 'SOL' ? 'SOL quote valid for 1 hour.' : 'Exact USDC amount or more.'}</p></div>`).join('')}</div>
      <p class="mut" style="font-size:12px">Payments go to <span class="mono">${esc(o.recipient)}</span> and are verified on-chain automatically — this page checks every 10 seconds. Keep this link: <span class="mono">${location.href}</span></p>` : ''}`;
  };
  const tick = async () => { try { const o = await api('/api/orders/' + id); render(o); if (o.status !== 'pending') clearInterval(iv); } catch (e) { app.innerHTML = `<div class="err">${esc(e.message)}</div>`; clearInterval(iv); } };
  const iv = setInterval(tick, 10000); cleanup.push(() => clearInterval(iv)); tick();
}

// ---------- glossary (first visit) ----------
function glossary(force) {
  if (!force && (LS.get('glossaryOff', false) || sessionStorage.getItem('ts:glossarySeen'))) return;
  $('#gloss')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div class="modal-bg" id="gloss"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="glT">
    <h2 id="glT">Welcome to On the Scope</h2><p class="mut" style="margin:-6px 0 14px;font-size:13px">Quick glossary of the tags you'll see:</p>
    <dl class="gl"><dt><span class="chip og">OG</span></dt><dd>The first token with that name to graduate — i.e. migrate from its launchpad to open trading.</dd>
    <dt><span class="chip vamp">VAMP</span></dt><dd>A later launch reusing an OG's name that has also graduated.</dd>
    <dt><span class="chip vv">VV</span></dt><dd><b>Valid Vamp</b>: a vamp 24h+ old whose few-hour smoothed market cap is 5x+ the OG's. It can lose the badge if it drops back under 5x.</dd>
    <dt>${scopeTag()}</dt><dd><b>Scoped</b>: the team paid for an enhanced profile that On the Scope reviewed. A paid listing, not an endorsement.</dd>
    <dt><span class="chip sscore s-g">${SCOPE_ICO}72</span></dt><dd><b>Scope Score</b> (0–100): 60% <b>coin fairness</b> (insiders, bundles, snipers, dev wallet, top holders, LP, fees → OK / NEUTRAL / SKETCHY / RIGGED) + 40% <b>narrative</b>, a heuristic of website, domain age, socials and GitHub (LIKELY REAL / PARTLY REAL / LIKELY LARP). DYOR.</dd></dl>
    <p class="dim" style="font-size:12px;margin:-6px 0 16px">Tokens that haven't graduated from their launchpad yet get no OG/VAMP tag.</p>
    <div class="mbtns"><button class="btn" id="glNo">Don't show again</button><button class="btn pri" id="glOk">Okay</button></div></div></div>`);
  const close = () => $('#gloss')?.remove();
  $('#glOk').onclick = () => { sessionStorage.setItem('ts:glossarySeen', '1'); close(); };
  $('#glNo').onclick = () => { LS.set('glossaryOff', true); close(); };
  $('#gloss').onclick = e => { if (e.target.id === 'gloss') $('#glOk').click(); };
  $('#glOk').focus();
}
document.addEventListener('click', e => { if (e.target.closest('[data-gloss]')) { e.preventDefault(); e.stopPropagation(); glossary(true); } });
const glossLink = '<a href="#" class="glink" data-gloss data-stop title="What do OG / VAMP / VV mean?">?</a>';

route();
setTimeout(() => glossary(false), 600);
