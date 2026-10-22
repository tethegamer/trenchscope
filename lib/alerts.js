// Alerts: Web Push (VAPID) + Telegram bot. Subscribers are identified by a random secret id (sid) kept in the
// browser; the browser re-syncs its watchlist / wallets / price targets here so alerts fire while the site is closed.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const webpush = require('web-push');

const SID = /^[a-f0-9]{32}$/;
const isMint = s => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s || '');
const clip = (s, n) => String(s ?? '').replace(/[\u0000-\u001f]/g, '').slice(0, n);
const DEFAULT_PREFS = { moves: true, movePct: 10, targets: true, wallets: true, vv: true, og: false };

/** VAPID keys from env, else from data/vapid.json, else generated now (with a loud warning). Never committed. */
function loadVapid(env, file, log) {
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, source: 'env' };
  try { const k = JSON.parse(fs.readFileSync(file, 'utf8')); if (k.publicKey && k.privateKey) { log.warn('[alerts] VAPID keys loaded from ' + file + ' (not from env). Set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY on Render so push survives redeploys.'); return { ...k, source: 'file' }; } } catch {}
  const k = webpush.generateVAPIDKeys();
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(k), { mode: 0o600 }); } catch {}
  log.warn(`[alerts] WARNING: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set — generated temporary keys for this run.
[alerts] Push subscriptions will break whenever these keys change (e.g. every Render deploy). To make them permanent, add these
[alerts] two env vars on Render (Environment tab). Public key: ${k.publicKey}
[alerts] The private key was written to ${file} (gitignored). Copy it from there or run: npx web-push generate-vapid-keys`);
  return { ...k, source: 'generated' };
}

function createAlerts({ env = process.env, dataDir, getPrices, ogPeek, ogResults, tracker, baseUrl, log = console, fetchImpl = fetch }) {
  const file = env.ALERTS_FILE || path.join(dataDir, 'alerts.json');
  const vapid = loadVapid(env, env.VAPID_FILE || path.join(dataDir, 'vapid.json'), log);
  webpush.setVapidDetails(env.VAPID_SUBJECT || 'mailto:alerts@onthescope.invalid', vapid.publicKey, vapid.privateKey);
  const tgToken = env.TELEGRAM_ALERTS_BOT_TOKEN || '';
  const linkKey = crypto.createHmac('sha256', 'ots-tg-link').update(tgToken || vapid.privateKey).digest();
  let subs = {};
  try { subs = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  let saveT; const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(subs)); } catch (e) { log.warn('[alerts] save', e.message); } }, 1500); };
  const status = { push: true, vapid: vapid.source, telegram: { enabled: !!tgToken, username: null, lastError: null }, sent: 0, subscribers: 0, lastTick: null };
  const tgSig = (sid, chat) => crypto.createHmac('sha256', linkKey).update(sid + ':' + chat).digest('base64url').slice(0, 22);
  const newCode = () => crypto.randomBytes(6).toString('base64url').replace(/[-_]/g, 'x');

  // ---------- delivery ----------
  async function tg(method, body) {
    const r = await fetchImpl(`https://api.telegram.org/bot${tgToken}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(method === 'getUpdates' ? 60000 : 15000) });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) { const e = new Error(`Telegram ${r.status}: ${j.description || 'error'}`); e.code = r.status; throw e; }
    return j.result;
  }
  const escH = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  async function notify(sub, msg) {
    const now = Date.now();
    sub.sentLog = (sub.sentLog || []).filter(t => now - t < 3600e3);
    if (sub.sentLog.length >= 40 && !msg.test) return false; // per-subscriber hourly cap
    sub.sentLog.push(now);
    const url = msg.url ? baseUrl() + msg.url : baseUrl() + '/';
    const jobs = [];
    if (sub.push) jobs.push(webpush.sendNotification(sub.push, JSON.stringify({ title: msg.title, body: msg.body, url: msg.url || '/', tag: msg.tag }), { TTL: 3600, urgency: 'high' })
      .catch(e => { if (e.statusCode === 404 || e.statusCode === 410 || e.statusCode === 403) { sub.push = null; save(); } else log.warn('[alerts] push', e.statusCode || e.message); }));
    if (sub.tg && tgToken) jobs.push(tg('sendMessage', { chat_id: sub.tg, text: `<b>${escH(msg.title)}</b>\n${escH(msg.body)}\n<a href="${escH(url)}">Open on On the Scope</a>`, parse_mode: 'HTML', disable_web_page_preview: true })
      .catch(e => { if (e.code === 403) { sub.tg = null; save(); } else log.warn('[alerts] telegram', e.message); }));
    await Promise.all(jobs); status.sent++;
    return jobs.length > 0;
  }

  // ---------- sync from the browser ----------
  function sync(body = {}) {
    const sid = String(body.sid || ''); if (!SID.test(sid)) throw Object.assign(new Error('bad sid'), { status: 400 });
    if (!subs[sid] && Object.keys(subs).length >= (+env.ALERTS_MAX_SUBS || 20000)) { // prune idle records that never enabled delivery
      for (const [k, v] of Object.entries(subs)) if (!v.push && !v.tg && Date.now() - (v.updatedAt || 0) > 86400e3) delete subs[k];
      if (Object.keys(subs).length >= (+env.ALERTS_MAX_SUBS || 20000)) throw Object.assign(new Error('Alerts are full right now, try later'), { status: 503 });
    }
    const sub = subs[sid] || (subs[sid] = { createdAt: Date.now(), base: {}, vvState: {}, code: newCode() });
    const p = body.prefs || {};
    sub.prefs = { ...DEFAULT_PREFS, ...Object.fromEntries(Object.keys(DEFAULT_PREFS).filter(k => k in p).map(k => [k, k === 'movePct' ? Math.min(100, Math.max(3, +p[k] || 10)) : !!p[k]])) };
    sub.watch = (Array.isArray(body.watch) ? body.watch : []).filter(w => isMint(w?.mint)).slice(0, 100).map(w => ({ mint: w.mint, symbol: clip(w.symbol, 16) }));
    sub.wallets = (Array.isArray(body.wallets) ? body.wallets : []).filter(w => isMint(w?.addr)).slice(0, 20).map(w => ({ addr: w.addr, label: clip(w.label, 24) }));
    sub.targets = (Array.isArray(body.targets) ? body.targets : []).filter(a => isMint(a?.mint) && +a.price > 0 && (a.dir === 'above' || a.dir === 'below')).slice(0, 50).map(a => ({ id: String(a.id).slice(0, 20), mint: a.mint, symbol: clip(a.symbol, 16), dir: a.dir, price: +a.price }));
    if (body.push === null) sub.push = null;
    else if (body.push && typeof body.push.endpoint === 'string' && /^https:\/\//.test(body.push.endpoint) && body.push.keys?.p256dh && body.push.keys?.auth) sub.push = { endpoint: body.push.endpoint.slice(0, 600), keys: { p256dh: clip(body.push.keys.p256dh, 200), auth: clip(body.push.keys.auth, 100) } };
    // restore a Telegram link after a server restart (signed, so nobody can point alerts at someone else's chat)
    if (!sub.tg && body.tgLink && typeof body.tgLink === 'string') { const [chat, sig] = body.tgLink.split('.'); if (/^-?\d{1,20}$/.test(chat) && sig === tgSig(sid, chat)) sub.tg = chat; }
    if (body.tgUnlink) sub.tg = null;
    sub.updatedAt = Date.now();
    const fired = sub.fired || []; sub.fired = [];
    save(); refreshWallets();
    return { ok: true, prefs: sub.prefs, push: !!sub.push, vapidPublicKey: vapid.publicKey, telegram: { enabled: !!tgToken, username: status.telegram.username, linked: !!sub.tg, code: sub.code, link: sub.tg ? sub.tg + '.' + tgSig(sid, sub.tg) : null }, fired };
  }
  async function test(sid) {
    const sub = subs[sid]; if (!sub) throw Object.assign(new Error('not subscribed'), { status: 404 });
    if (!sub.push && !sub.tg) throw Object.assign(new Error('Turn on push or link Telegram first'), { status: 400 });
    await notify(sub, { title: '🎯 Test alert', body: 'Alerts are working. You’ll get pings for your watchlist, wallets and price targets here.', url: '/profile?tab=alerts', tag: 'test', test: true });
    return { ok: true, push: !!sub.push, telegram: !!sub.tg };
  }
  function remove(sid) { if (SID.test(sid)) { delete subs[sid]; save(); refreshWallets(); } }

  function refreshWallets() {
    const map = new Map();
    for (const s of Object.values(subs)) if ((s.push || s.tg) && s.prefs?.wallets) for (const w of s.wallets || []) if (!map.has(w.addr)) map.set(w.addr, { addr: w.addr, label: w.label });
    tracker?.setSource('users', [...map.values()].slice(0, 200));
    status.subscribers = Object.values(subs).filter(s => s.push || s.tg).length;
  }

  // ---------- triggers ----------
  const fmtP = p => p >= 1 ? '$' + p.toLocaleString('en', { maximumFractionDigits: 4 }) : '$' + (+p.toPrecision(4)).toString();
  let ogPrimed = false; const ogSeen = new Set();
  async function tick() {
    const active = Object.entries(subs).filter(([, s]) => s.push || s.tg);
    status.lastTick = Date.now();
    if (!active.length) return;
    const mints = new Set();
    for (const [, s] of active) { if (s.prefs.moves || s.prefs.vv) s.watch.forEach(w => mints.add(w.mint)); if (s.prefs.targets) s.targets.forEach(t => mints.add(t.mint)); }
    const prices = mints.size ? await getPrices([...mints].slice(0, 300)).catch(() => new Map()) : new Map();
    for (const [, s] of active) {
      if (s.prefs.targets) for (const t of [...s.targets]) {
        const p = prices.get(t.mint)?.priceUsd; if (!(p > 0)) continue;
        if (t.dir === 'above' ? p >= t.price : p <= t.price) {
          await notify(s, { title: `🎯 ${t.symbol || 'Token'} ${t.dir === 'above' ? 'above' : 'below'} ${fmtP(t.price)}`, body: `Now ${fmtP(p)}. Your price target was hit.`, url: '/token/' + t.mint, tag: 'tgt' + t.id });
          s.targets = s.targets.filter(x => x !== t); (s.fired = s.fired || []).push(t.id); save();
        }
      }
      if (s.prefs.moves) for (const w of s.watch) {
        const p = prices.get(w.mint)?.priceUsd; if (!(p > 0)) continue;
        const b = s.base[w.mint];
        if (!b || Date.now() - b.at > 24 * 3600e3) { s.base[w.mint] = { p, at: Date.now() }; continue; }
        const ch = (p / b.p - 1) * 100;
        if (Math.abs(ch) >= s.prefs.movePct) {
          const sym = prices.get(w.mint)?.symbol || w.symbol || 'Token';
          await notify(s, { title: `${ch > 0 ? '📈' : '📉'} ${sym} ${ch > 0 ? '+' : ''}${ch.toFixed(1)}%`, body: `${fmtP(b.p)} → ${fmtP(p)} since ${new Date(b.at).toISOString().slice(11, 16)} UTC (watchlist move ≥ ${s.prefs.movePct}%).`, url: '/token/' + w.mint, tag: 'mv' + w.mint });
          s.base[w.mint] = { p, at: Date.now() }; save();
        }
      }
      if (s.prefs.vv) for (const w of s.watch) {
        const o = ogPeek(w.mint); if (!o || o.status !== 'vamp') continue;
        const v = !!o.vv, prev = s.vvState[w.mint];
        if (prev !== undefined && prev !== v) await notify(s, { title: v ? `🧛 ${w.symbol || o.symbol} is now a Valid Vamp` : `🧛 ${w.symbol || o.symbol} lost Valid Vamp`, body: v ? `Flipped the OG ${o.og?.symbol || ''} ${o.ratio?.toFixed(1)}x (4h-smoothed market cap).` : `Fell back under 5x the OG ${o.og?.symbol || ''} (${o.ratio ? o.ratio.toFixed(1) + 'x' : 'n/a'}).`, url: '/token/' + w.mint, tag: 'vv' + w.mint });
        if (prev !== v) { s.vvState[w.mint] = v; save(); }
      }
    }
    // new OG migrations (first token with its name to graduate), seen in the last 3h
    const fresh = [];
    for (const [m, r] of Object.entries(ogResults())) if (r.status === 'og' && r.gradAt && Date.now() - r.gradAt < 3 * 3600e3 && !ogSeen.has(m)) { ogSeen.add(m); fresh.push([m, r]); }
    if (ogPrimed) for (const [m, r] of fresh.slice(0, 5)) for (const [, s] of active) if (s.prefs.og) await notify(s, { title: `👑 New OG migration: ${r.symbol}`, body: `First “${r.symbol}” to graduate (${r.gradDex || 'DEX'}). Watch for vamps. DYOR.`, url: '/token/' + m, tag: 'og' + m });
    ogPrimed = true;
  }
  // tracked-wallet buys/sells
  tracker?.onTrade(async e => {
    if (!e.live || !e.labels?.some(l => l.source === 'users')) return;
    const meta = (await getPrices([e.mint]).catch(() => new Map())).get(e.mint) || {};
    for (const s of Object.values(subs)) {
      if (!(s.push || s.tg) || !s.prefs?.wallets) continue;
      const w = (s.wallets || []).find(x => x.addr === e.wallet); if (!w) continue;
      const who = w.label || e.wallet.slice(0, 4) + '…' + e.wallet.slice(-4);
      const paid = e.sol ? `${e.sol.toFixed(2)} SOL` : e.usdStable ? `$${e.usdStable.toFixed(0)}` : '';
      await notify(s, { title: `👛 ${who} ${e.side === 'buy' ? 'bought' : 'sold'} ${meta.symbol || e.mint.slice(0, 4) + '…'}`, body: `${e.side === 'buy' ? 'Spent' : 'Got'} ${paid}${meta.priceUsd ? ' · price ' + fmtP(meta.priceUsd) : ''}${meta.mcap ? ' · MC $' + Intl.NumberFormat('en', { notation: 'compact' }).format(meta.mcap) : ''}`, url: '/token/' + e.mint, tag: 'w' + e.sig });
    }
  });

  // ---------- Telegram long polling ----------
  let tgOffset = 0, tgRun = false;
  async function tgLoop() {
    tgRun = true;
    try { const me = await tg('getMe', {}); status.telegram.username = me.username; log.log('[alerts] Telegram bot @' + me.username + ' ready'); }
    catch (e) { status.telegram.lastError = e.message; log.warn('[alerts] Telegram disabled:', e.message); if (e.code === 401 || e.code === 404) return; }
    while (tgRun) {
      try {
        const ups = await tg('getUpdates', { offset: tgOffset, timeout: 50, allowed_updates: ['message'] });
        for (const u of ups) { tgOffset = u.update_id + 1; await onTg(u.message).catch(e => log.warn('[alerts] tg msg', e.message)); }
        status.telegram.lastError = null;
      } catch (e) { status.telegram.lastError = e.message; await new Promise(r => setTimeout(r, e.code === 409 ? 30000 : 5000)); }
    }
  }
  async function onTg(m) {
    if (!m?.text || !m.chat) return;
    const chat = String(m.chat.id); const [cmd, arg] = m.text.trim().split(/\s+/);
    const reply = text => tg('sendMessage', { chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true });
    if (/^\/start/.test(cmd)) {
      if (!arg) return reply('👋 This is the <b>On the Scope</b> alerts bot.\nOpen your profile → <b>Alerts</b> on the site and tap <b>Link Telegram</b> (or send <code>/start YOURCODE</code>).');
      const hit = Object.values(subs).find(s => s.code === arg);
      if (!hit) return reply('❌ That link code wasn’t found. Open Profile → Alerts on the site and use the current code.');
      hit.tg = chat; hit.code = newCode(); save(); refreshWallets();
      return reply('✅ Linked! You’ll get alerts here for your watchlist, tracked wallets, price targets and the triggers you turned on.\nSend /stop to unlink.');
    }
    if (/^\/stop/.test(cmd)) { let n = 0; for (const s of Object.values(subs)) if (s.tg === chat) { s.tg = null; n++; } save(); refreshWallets(); return reply(n ? '🔕 Unlinked. No more alerts here.' : 'Nothing was linked to this chat.'); }
    if (/^\/help/.test(cmd)) return reply('/start CODE — link your On the Scope profile\n/stop — unlink this chat');
  }

  let timer;
  return {
    status, sync, test, remove, tick, notify, vapidPublicKey: vapid.publicKey, _subs: () => subs, _onTg: onTg, _tgSig: tgSig,
    start() { refreshWallets(); timer = setInterval(() => tick().catch(e => log.warn('[alerts] tick', e.message)), +env.ALERTS_TICK_MS || 60000); timer.unref?.(); if (tgToken) tgLoop(); },
    stop() { clearInterval(timer); tgRun = false; },
  };
}
module.exports = { createAlerts, loadVapid, DEFAULT_PREFS };
