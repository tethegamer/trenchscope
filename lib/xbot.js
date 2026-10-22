// On the Scope — X (Twitter) reply bot.
// Watches mentions of X_BOT_HANDLE, finds a contract address in the mention (or the post it replies to / quotes)
// and replies with the Scope Score + a link to the token page. Disabled unless all four OAuth 1.0a user keys are set.
// Docs: docs/x-bot.md
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const API = 'https://api.x.com/2';
const SOL_RE = /(?<![A-Za-z0-9])[1-9A-HJ-NP-Za-km-z]{32,44}(?![A-Za-z0-9])/g;
const EVM_RE = /(?<![A-Za-z0-9])0x[0-9a-fA-F]{40}(?![A-Za-z0-9])/g;

// RFC 3986 percent-encoding as OAuth 1.0a requires
const pct = s => encodeURIComponent(String(s)).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

/** OAuth 1.0a HMAC-SHA1 Authorization header (query params are signed; JSON bodies are not). */
function oauthHeader(method, url, keys, nonce = crypto.randomBytes(16).toString('hex'), ts = Math.floor(Date.now() / 1000)) {
  const u = new URL(url);
  const o = { oauth_consumer_key: keys.apiKey, oauth_nonce: nonce, oauth_signature_method: 'HMAC-SHA1', oauth_timestamp: String(ts), oauth_token: keys.accessToken, oauth_version: '1.0' };
  const params = [...Object.entries(o), ...[...u.searchParams.entries()]].map(([k, v]) => [pct(k), pct(v)]).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1);
  const base = [method.toUpperCase(), pct(u.origin + u.pathname), pct(params.map(([k, v]) => k + '=' + v).join('&'))].join('&');
  o.oauth_signature = crypto.createHmac('sha1', pct(keys.apiSecret) + '&' + pct(keys.accessSecret)).update(base).digest('base64');
  return 'OAuth ' + Object.entries(o).map(([k, v]) => `${pct(k)}="${pct(v)}"`).join(', ');
}

/** Find the first contract address in a post: DexScreener/pump.fun/etc. links first, then raw addresses. */
function extractCA(text = '', urls = []) {
  for (const u of urls) {
    const m = String(u).match(/(?:dexscreener\.com\/([a-z0-9-]+)\/|pump\.fun\/(?:coin\/)?|birdeye\.so\/token\/|solscan\.io\/token\/|jup\.ag\/(?:swap\/[^/]+-|tokens\/)|gmgn\.ai\/sol\/token\/|\/token\/)([1-9A-HJ-NP-Za-km-z]{32,44}|0x[0-9a-fA-F]{40})/);
    if (m) return { address: m[2], chain: m[1] && m[1] !== 'solana' ? m[1] : /^0x/.test(m[2]) ? null : 'solana', viaPair: !!m[1] };
  }
  const t = String(text).replace(/https?:\/\/\S+/g, ' ');
  const evm = t.match(EVM_RE); if (evm) return { address: evm[0], chain: null };
  const sol = (t.match(SOL_RE) || []).find(s => /\d/.test(s) && /[a-z]/.test(s) && /[A-Z]/.test(s));
  return sol ? { address: sol, chain: 'solana' } : null;
}

const short = s => s.length > 12 ? s.slice(0, 4) + '…' + s.slice(-4) : s;
/** Build the reply (<= 280 chars; X counts any URL as 23). */
function replyText(s, link) {
  const sym = s.symbol ? '$' + String(s.symbol).replace(/[^A-Za-z0-9_]/g, '').slice(0, 12) : short(s.address);
  const head = `🎯 ${sym} Scope Score: ${s.total}/100`;
  const parts = [s.coin ? `Coin ${s.coin.score} · ${s.coin.label}` : null, `Narrative ${s.narrative.score} · ${s.narrative.label}`].filter(Boolean).join(' | ');
  const flags = [];
  const it = k => s.coin?.items?.find(i => i.key === k);
  if (s.coin?.caps?.length) flags.push('⚠ ' + s.coin.caps[0]);
  for (const k of ['insiders', 'bundles', 'snipers', 'dev', 'top10']) { const i = it(k); if (i && i.level === 'danger') flags.push(`${i.label}: ${i.value}`); }
  const tail = `Breakdown: ${link}\nDYOR · not financial advice`;
  const len = str => str.replace(/https?:\/\/\S+/g, 'x'.repeat(23)).length;
  let body = [head, parts, s.reason ? '“' + s.reason + '”' : null, flags.length ? flags.slice(0, 2).join(' · ') : null].filter(Boolean);
  let out = [...body, tail].join('\n');
  while (len(out) > 280 && body.length > 2) { body.pop(); out = [...body, tail].join('\n'); }
  if (len(out) > 280) out = [head, tail].join('\n');
  return out;
}

function createXBot({ scoreFor, resolveChain, baseUrl, log = console, env = process.env, fetchImpl = fetch, stateFile }) {
  const keys = { apiKey: env.X_API_KEY, apiSecret: env.X_API_SECRET, accessToken: env.X_ACCESS_TOKEN, accessSecret: env.X_ACCESS_SECRET };
  const handle = String(env.X_BOT_HANDLE || 'OnTheScope').replace(/^@/, '');
  const enabled = !!(keys.apiKey && keys.apiSecret && keys.accessToken && keys.accessSecret);
  const dryRun = env.X_BOT_DRY_RUN === '1';
  const pollMs = Math.max(30, +env.X_POLL_SECONDS || 90) * 1000;
  const maxPerHour = Math.max(1, +env.X_MAX_REPLIES_PER_HOUR || 30);
  const perAuthorHour = 3;
  const status = { enabled, handle, dryRun, pollSeconds: pollMs / 1000, userId: null, lastPoll: null, lastError: null, replies: 0, skipped: 0, pausedUntil: null };
  if (!enabled) return { status, start() {}, stop() {}, handleMention: null };
  let state = { sinceId: null, replied: [] };
  try { state = { ...state, ...JSON.parse(fs.readFileSync(stateFile, 'utf8')) }; } catch {}
  const save = () => { try { fs.mkdirSync(path.dirname(stateFile), { recursive: true }); fs.writeFileSync(stateFile, JSON.stringify({ sinceId: state.sinceId, replied: state.replied.slice(-500) })); } catch (e) { log.warn('[xbot] state save failed', e.message); } };
  const sent = []; // timestamps of replies (rolling hour)
  const byAuthor = new Map();
  let timer = null;

  async function x(method, url, body) {
    if (status.pausedUntil && Date.now() < status.pausedUntil) throw new Error('rate limited until ' + new Date(status.pausedUntil).toISOString());
    const r = await fetchImpl(url, { method, headers: { Authorization: oauthHeader(method, url, keys), ...(body ? { 'Content-Type': 'application/json' } : {}), 'User-Agent': 'OnTheScope-bot' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
    const rem = r.headers.get('x-rate-limit-remaining'), reset = +r.headers.get('x-rate-limit-reset');
    if (r.status === 429 || (rem === '0' && reset)) status.pausedUntil = (reset ? reset * 1000 : Date.now() + 15 * 60e3) + 2000;
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`X ${r.status}: ${j.detail || j.title || JSON.stringify(j).slice(0, 160)}`);
    return j;
  }

  async function handleMention(tw, includes, { me }) {
    if (tw.author_id === me) return 'own';
    if (state.replied.includes(tw.id)) return 'dupe';
    const now = Date.now();
    while (sent.length && now - sent[0] > 3600e3) sent.shift();
    if (sent.length >= maxPerHour) return 'hourly cap';
    const a = (byAuthor.get(tw.author_id) || []).filter(t => now - t < 3600e3);
    if (a.length >= perAuthorHour) return 'author cap';
    const urlsOf = t => (t?.entities?.urls || []).map(u => u.expanded_url || u.url);
    const tweets = new Map((includes?.tweets || []).map(t => [t.id, t]));
    let ca = extractCA(tw.text.replace(new RegExp('@' + handle, 'ig'), ''), urlsOf(tw));
    if (!ca) for (const ref of tw.referenced_tweets || []) { const p = tweets.get(ref.id); if (p && (ca = extractCA(p.text, urlsOf(p)))) break; }
    if (!ca) return 'no CA';
    const res = await resolveChain(ca).catch(() => null);
    if (!res) return 'unknown token';
    const { chain, address } = res;
    let s;
    try { s = await scoreFor(chain, address); } catch (e) { return 'score failed: ' + e.message; }
    const text = replyText(s, `${baseUrl()}/token/${s.address}${chain !== 'solana' ? '?chain=' + chain : ''}`);
    state.replied.push(tw.id); save();
    if (dryRun) { log.log('[xbot] DRY RUN reply to', tw.id, '\n' + text); }
    else await x('POST', API + '/tweets', { text, reply: { in_reply_to_tweet_id: tw.id } });
    sent.push(now); a.push(now); byAuthor.set(tw.author_id, a); status.replies++;
    return 'replied';
  }

  async function poll() {
    try {
      if (!status.userId) {
        const me = await x('GET', API + '/users/me');
        status.userId = me.data.id;
        if (me.data.username.toLowerCase() !== handle.toLowerCase()) log.warn(`[xbot] access token is for @${me.data.username}, but X_BOT_HANDLE is @${handle} — watching @${me.data.username}'s mentions`);
        status.handle = me.data.username;
      }
      const q = new URLSearchParams({ max_results: '20', 'tweet.fields': 'author_id,conversation_id,referenced_tweets,entities,created_at', expansions: 'referenced_tweets.id', ...(state.sinceId ? { since_id: state.sinceId } : {}) });
      const j = await x('GET', `${API}/users/${status.userId}/mentions?${q}`);
      status.lastPoll = Date.now(); status.lastError = null;
      const list = (j.data || []).slice().reverse(); // oldest first
      if (!state.sinceId) { // first run: don't answer the backlog
        state.sinceId = j.meta?.newest_id || '1'; save();
        log.log(`[xbot] watching @${status.handle} mentions (skipped ${list.length} older mention(s))`);
        return;
      }
      for (const tw of list) {
        const r = await handleMention(tw, j.includes, { me: status.userId }).catch(e => 'error: ' + e.message);
        if (r !== 'replied') status.skipped++;
        if (r && r !== 'replied' && r !== 'no CA') log.log('[xbot] skip', tw.id, r);
        if (/hourly cap|rate limited/.test(r)) break;
        state.sinceId = tw.id;
      }
      if (j.meta?.newest_id && !list.length) state.sinceId = j.meta.newest_id;
      save();
    } catch (e) { status.lastError = e.message; log.warn('[xbot]', e.message); }
  }
  return {
    status, handleMention, poll,
    start() { if (timer) return; log.log(`[xbot] enabled for @${handle}${dryRun ? ' (DRY RUN — no replies are posted)' : ''}, polling every ${pollMs / 1000}s`); setTimeout(poll, 5000).unref?.(); timer = setInterval(() => { if (!status.pausedUntil || Date.now() > status.pausedUntil) poll(); }, pollMs); timer.unref?.(); },
    stop() { clearInterval(timer); timer = null; },
  };
}

module.exports = { createXBot, extractCA, replyText, oauthHeader };
