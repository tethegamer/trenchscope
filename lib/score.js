// Scope Score: one number a trencher can read in a second, plus the receipts.
//   COIN (fairness, 0-100)     — measured from on-chain/holder data (RugCheck, GoPlus, Solana RPC).
//   NARRATIVE (0-100)          — HEURISTIC: is there a real project behind the ticker? (website, domain age, socials, GitHub)
//   TOTAL = 60% coin + 40% narrative.  Inspired by @larpcheckbot.  Not financial advice — DYOR.
// Pure scoring functions are exported separately so they can be unit-tested without the network.

const clamp = (x, a = 0, b = 100) => Math.max(a, Math.min(b, x));
const f1 = x => (x == null ? 'n/a' : (x < 10 ? x.toFixed(1) : x.toFixed(0)) + '%');
const item = (key, label, points, max, value, note, level) => ({ key, label, points: Math.round(points), max, value, note, level: level || (points >= max * 0.8 ? 'ok' : points >= max * 0.45 ? 'warn' : 'danger') });

const COIN_LABEL = s => (s >= 75 ? 'OK' : s >= 55 ? 'NEUTRAL' : s >= 35 ? 'SKETCHY' : 'RIGGED');
const NARR_LABEL = s => (s >= 60 ? 'LIKELY REAL' : s >= 35 ? 'PARTLY REAL' : 'LIKELY LARP');
const TOTAL_GRADE = s => (s >= 70 ? 'good' : s >= 50 ? 'mid' : s >= 35 ? 'weak' : 'bad');

// ---------- COIN: Solana (input = lib/safety.js scoreReport output + optional early-buyer scan) ----------
function coinSolana(rep, early) {
  if (!rep || rep.unavailable) return null;
  const items = [];
  const ins = rep.insiderPct;
  items.push(item('insiders', 'Insiders / linked wallets', ins == null ? 10 : ins < 2 ? 20 : ins < 5 ? 16 : ins < 10 ? 10 : ins < 20 ? 5 : 0, 20,
    f1(ins), ins == null ? 'RugCheck could not map wallet links' : `Wallet clusters linked by transfers hold ${f1(ins)} (${rep.insiderClusters || 0} cluster${rep.insiderClusters === 1 ? '' : 's'})`, ins == null ? 'na' : undefined));
  const big = rep.biggestCluster || 0;
  items.push(item('bundles', 'Bundled launch', rep.bundled ? 0 : big >= 5 ? 5 : 10, 10, rep.bundled ? 'YES' : big >= 5 ? `${big}-wallet cluster` : 'no',
    rep.bundled ? `Looks bundled — largest linked cluster is ${big} wallets` : big >= 5 ? `A ${big}-wallet cluster exists but holds little` : 'No bundle pattern found'));
  const sn = early && !early.unavailable ? early.sniperHoldPct : null;
  items.push(item('snipers', 'Snipers (first ~1s)', sn == null ? 6 : sn < 3 ? 10 : sn < 8 ? 7 : sn < 15 ? 4 : 0, 10, sn == null ? 'n/a' : f1(sn),
    sn == null ? (early?.unavailable || 'Launch not scanned yet') : `${early.snipers} wallet${early.snipers === 1 ? '' : 's'} bought in the first blocks (${f1(early.sniperBoughtPct)} of supply) ${sn > 0 ? ` and still hold ≥${f1(sn)}` : ' and no longer hold a top-20 bag'}`, sn == null ? 'na' : undefined));
  const dNow = rep.creatorPct, dInit = early && !early.unavailable ? early.devInitialPct : null;
  const devSold = dInit != null && dInit >= 0.5 && (dNow ?? 0) < dInit * 0.5;
  let dp = 10, dnote = 'Dev wallet unknown', dval = 'n/a';
  if (dNow != null) {
    dval = devSold ? 'SOLD' : f1(dNow);
    if (dNow > 15) { dp = 0; dnote = `Dev still holds ${f1(dNow)} — one wallet can dump on you`; }
    else if (dNow > 5) { dp = 5; dnote = `Dev holds ${f1(dNow)}`; }
    else if (devSold) { dp = 6; dnote = `Dev bought ${f1(dInit)} at launch and sold down to ${f1(dNow)}`; }
    else { dp = 15; dnote = dInit != null ? (dInit < 0.05 ? `Dev didn't buy at launch · holds ${f1(dNow)}` : `Dev bought ${f1(dInit)} at launch, holds ${f1(dNow)}`) : `Dev holds ${f1(dNow)}`; }
  }
  items.push(item('dev', 'Dev wallet', dp, 15, dval, dnote, dNow == null ? 'na' : undefined));
  const t10 = rep.top10;
  items.push(item('top10', 'Top 10 holders', t10 == null ? 7 : t10 < 15 ? 15 : t10 < 25 ? 12 : t10 < 35 ? 8 : t10 < 50 ? 4 : 0, 15, f1(t10), t10 == null ? 'No holder data' : `Top 10 wallets (excl. pools/lockers) hold ${f1(t10)}`, t10 == null ? 'na' : undefined));
  const h = rep.holders;
  items.push(item('holders', 'Holders', h == null ? 4 : h >= 2000 ? 10 : h >= 1000 ? 8 : h >= 500 ? 6 : h >= 200 ? 4 : h >= 50 ? 2 : 0, 10, h == null ? 'n/a' : h.toLocaleString('en-US'), h == null ? 'No holder count' : `${h.toLocaleString('en-US')} wallets hold it`, h == null ? 'na' : undefined));
  const lp = rep.lpLocked;
  items.push(item('lp', 'Liquidity lock', rep.isCurve ? 10 : lp == null ? 5 : lp >= 90 ? 10 : lp >= 50 ? 5 : 0, 10, rep.isCurve ? 'curve' : f1(lp),
    rep.isCurve ? 'Still on the bonding curve — no LP to pull' : lp == null ? 'LP lock unknown' : lp >= 90 ? `${f1(lp)} of LP burned/locked` : `Only ${f1(lp)} of LP locked — can be pulled`, !rep.isCurve && lp == null ? 'na' : undefined));
  const fee = rep.transferFeePct || 0;
  let cp = (rep.mintAuth ? 0 : 5) + (rep.freezeAuth ? 0 : 5) - (fee > 0 ? Math.min(5, fee) : 0);
  const cnote = [rep.mintAuth ? 'mint authority ACTIVE' : 'mint revoked', rep.freezeAuth ? 'freeze authority ACTIVE' : 'freeze revoked', fee > 0 ? `${fee}% transfer fee` : 'no fees'].join(' · ');
  items.push(item('contract', 'Contract & fees', clamp(cp, 0, 10), 10, rep.mintAuth || rep.freezeAuth ? 'RISK' : fee > 0 ? `${fee}% fee` : 'clean', cnote));
  let score = items.reduce((s, i) => s + i.points, 0);
  const caps = [];
  if (rep.rugged) { score = 0; caps.push('RugCheck flags it RUGGED'); }
  if (rep.mintAuth || rep.freezeAuth) { score = Math.min(score, 50); caps.push('live mint/freeze authority caps the score at 50'); }
  if (rep.bundled) { score = Math.min(score, 54); caps.push('bundled launch caps the score at 54'); }
  score = clamp(Math.round(score));
  return { score, label: COIN_LABEL(score), items, caps, source: 'RugCheck + GoPlus + Solana RPC' };
}

// ---------- COIN: EVM via GoPlus token_security ----------
function coinEvm(g) {
  if (!g) return null;
  const yes = k => g[k] === '1' || g[k] === 1;
  const n = k => (g[k] == null || g[k] === '' ? null : Number(g[k]));
  const items = [];
  const owner = n('owner_percent') != null ? n('owner_percent') * 100 : null;
  items.push(item('insiders', 'Owner wallet', owner == null ? 10 : owner < 2 ? 20 : owner < 5 ? 16 : owner < 10 ? 10 : owner < 20 ? 5 : 0, 20, f1(owner), owner == null ? 'Owner share unknown' : `Contract owner holds ${f1(owner)}`, owner == null ? 'na' : undefined));
  items.push(item('bundles', 'Bundled launch', 6, 10, 'n/a', 'Bundle detection is Solana-only for now', 'na'));
  items.push(item('snipers', 'Snipers', 6, 10, 'n/a', 'Sniper scan is Solana-only for now', 'na'));
  const cr = n('creator_percent') != null ? n('creator_percent') * 100 : null;
  items.push(item('dev', 'Dev wallet', cr == null ? 10 : cr > 15 ? 0 : cr > 5 ? 5 : 15, 15, f1(cr), cr == null ? 'Creator share unknown' : `Creator holds ${f1(cr)}`, cr == null ? 'na' : undefined));
  const hs = (g.holders || []).filter(x => !(x.is_locked === 1) && !/^0x0{40}$|dead$/i.test(x.address || ''));
  const t10 = hs.length ? hs.slice(0, 10).reduce((s, x) => s + Number(x.percent || 0) * 100, 0) : null;
  items.push(item('top10', 'Top 10 holders', t10 == null ? 7 : t10 < 15 ? 15 : t10 < 25 ? 12 : t10 < 35 ? 8 : t10 < 50 ? 4 : 0, 15, f1(t10), t10 == null ? 'No holder data' : `Top 10 wallets hold ${f1(t10)} (may include pools)`, t10 == null ? 'na' : undefined));
  const h = n('holder_count');
  items.push(item('holders', 'Holders', h == null ? 4 : h >= 2000 ? 10 : h >= 1000 ? 8 : h >= 500 ? 6 : h >= 200 ? 4 : h >= 50 ? 2 : 0, 10, h == null ? 'n/a' : h.toLocaleString('en-US'), h == null ? 'No holder count' : `${h.toLocaleString('en-US')} holders`, h == null ? 'na' : undefined));
  const lph = g.lp_holders || [];
  const lp = lph.length ? lph.filter(x => x.is_locked === 1 || /^0x0{40}$|dead$/i.test(x.address || '')).reduce((s, x) => s + Number(x.percent || 0) * 100, 0) : null;
  items.push(item('lp', 'Liquidity lock', lp == null ? 5 : lp >= 90 ? 10 : lp >= 50 ? 5 : 0, 10, f1(lp), lp == null ? 'LP lock unknown' : lp >= 90 ? `${f1(lp)} of LP locked/burned` : `Only ${f1(lp)} of LP locked — common for big tokens, risky for new ones`, lp == null ? 'na' : undefined));
  const bt = (n('buy_tax') || 0) * 100, st = (n('sell_tax') || 0) * 100;
  const bad = ['is_honeypot', 'cannot_sell_all', 'hidden_owner', 'can_take_back_ownership', 'owner_change_balance', 'selfdestruct'].filter(yes);
  const meh = ['is_mintable', 'transfer_pausable', 'is_blacklisted', 'slippage_modifiable', 'is_proxy'].filter(yes);
  const cp = clamp(10 - bad.length * 10 - meh.length * 2 - Math.min(6, (bt + st) / 2) - (g.is_open_source === '0' ? 5 : 0), 0, 10);
  items.push(item('contract', 'Contract & taxes', cp, 10, bad.length ? 'DANGER' : `${bt.toFixed(0)}/${st.toFixed(0)}% tax`,
    [bad.length ? bad.join(', ').replace(/_/g, ' ') : 'no honeypot/owner tricks', meh.length ? meh.join(', ').replace(/_/g, ' ') : '', `buy ${bt.toFixed(1)}% / sell ${st.toFixed(1)}% tax`, g.is_open_source === '0' ? 'source NOT verified' : ''].filter(Boolean).join(' · ')));
  let score = items.reduce((s, i) => s + i.points, 0);
  const caps = [];
  if (yes('is_honeypot') || yes('cannot_sell_all')) { score = Math.min(score, 10); caps.push('honeypot: you may not be able to sell'); }
  else if (bad.length) { score = Math.min(score, 40); caps.push('dangerous owner powers cap the score at 40'); }
  if (bt > 10 || st > 10) { score = Math.min(score, 45); caps.push('tax above 10% caps the score at 45'); }
  score = clamp(Math.round(score));
  return { score, label: COIN_LABEL(score), items, caps, source: 'GoPlus' };
}

// ---------- NARRATIVE (heuristic) ----------
// sig = { site:{url,reachable,textLen,title,parked,freeHost}, domainAgeDays, x:{url,kind:'account'|'post'|'community'}, community:[...], github:{repo,exists,pushedDaysAgo}, description }
function narrative(sig) {
  const items = [];
  const s = sig.site;
  items.push(item('site', 'Website', !s ? 0 : s.reachable ? 20 : 4, 20, !s ? 'none' : s.reachable ? 'online' : 'down',
    !s ? 'No website listed' : s.reachable ? `${s.host} loads` : `${s.host} does not load (${s.error || 'error'})`));
  const spa = s && s.reachable && s.textLen < 200 && s.title && s.scripts > 0;
  const content = !s || !s.reachable ? 0 : s.parked ? 0 : s.textLen >= 800 ? 10 : s.textLen >= 200 || spa ? 6 : 2;
  items.push(item('content', 'Site content', content, 10, !s || !s.reachable ? '—' : s.parked ? 'parked' : spa ? 'web app' : `${s.textLen} chars`,
    !s || !s.reachable ? 'Nothing to read' : s.parked ? 'Looks like a parked / for-sale page' : s.textLen >= 800 ? `Real page${s.title ? `: “${s.title.slice(0, 60)}”` : ''}` : spa ? `App-style site “${s.title.slice(0, 50)}” (content loads in the browser)` : 'Thin one-pager'));
  const age = sig.domainAgeDays;
  const ap = !s ? 0 : s.freeHost ? 3 : age == null ? 5 : age > 180 ? 15 : age > 30 ? 10 : age > 7 ? 5 : 1;
  items.push(item('age', 'Domain age', ap, 15, !s ? '—' : s.freeHost ? 'free host' : age == null ? 'n/a' : age < 1 ? '<1 day' : `${Math.round(age)}d`,
    !s ? 'No domain' : s.freeHost ? `Hosted on a free subdomain (${s.host})` : age == null ? 'Registration date not public' : age > 180 ? 'Domain is months old' : age > 30 ? 'Domain registered over a month ago' : 'Domain registered very recently', s && !s.freeHost && age == null ? 'na' : undefined));
  const x = sig.x;
  items.push(item('x', 'X / Twitter', !x ? 0 : x.kind === 'account' ? 15 : 8, 15, !x ? 'none' : x.kind === 'account' ? '@' + x.handle : x.kind,
    !x ? 'No X account linked' : x.kind === 'account' ? `Links @${x.handle} (account not verified — check it yourself)` : `Only links a ${x.kind}, not a project account`));
  const c = sig.community || [];
  items.push(item('community', 'Telegram / Discord', c.length ? 10 : 0, 10, c.length ? c.join(' + ') : 'none', c.length ? `Has ${c.join(' and ')}` : 'No Telegram or Discord'));
  const g = sig.github;
  items.push(item('github', 'GitHub', g?.exists ? (g.fork ? 8 : 15) : g ? 3 : 0, 15, g?.exists ? g.repo : g ? 'broken' : 'none', g?.exists ? `Public repo ${g.repo}${g.stars ? ` · ${g.stars}★` : ''}${g.fork ? ' (a fork)' : ''} — check it really belongs to the team` : g ? `Linked repo ${g.repo} not found` : 'No code linked'));
  const pd = g?.exists ? g.pushedDaysAgo : null;
  items.push(item('commits', 'Recent commits', pd == null ? 0 : pd <= 30 ? 10 : pd <= 90 ? 5 : 1, 10, pd == null ? '—' : pd < 1 ? 'today' : `${Math.round(pd)}d ago`, pd == null ? 'No repo activity to check' : `Last push ${pd < 1 ? 'today' : Math.round(pd) + ' days ago'}`));
  const d = (sig.description || '').trim();
  items.push(item('about', 'Description', d.length >= 40 ? 5 : d ? 2 : 0, 5, d ? `${d.length} chars` : 'none', d ? `“${d.slice(0, 80)}${d.length > 80 ? '…' : ''}”` : 'No description'));
  const score = clamp(Math.round(items.reduce((s2, i) => s2 + i.points, 0)));
  return { score, label: NARR_LABEL(score), items, heuristic: true };
}

function reasonLine(coin, narr) {
  const parts = [];
  if (coin) {
    if (coin.caps.length) parts.push(coin.caps[0].replace(/ caps the score.*/, ''));
    const worst = coin.items.filter(i => i.level === 'danger' && i.key !== 'holders').sort((a, b) => (b.max - b.points) - (a.max - a.points))[0];
    if (worst && !parts.length) parts.push(worst.note);
    if (!parts.length) parts.push(coin.score >= 75 ? 'Fair distribution, no major red flags' : 'Mixed holder signals');
  } else parts.push('No fairness data for this chain');
  if (narr) {
    const has = id => narr.items.find(i => i.key === id)?.points > 0;
    if (narr.score >= 60) parts.push('real project footprint');
    else if (!has('site') && !has('x') && !has('community')) parts.push('no website or socials');
    else if (!has('site')) parts.push('socials but no website');
    else if (narr.items.find(i => i.key === 'site').points < 20) parts.push('website is down');
    else parts.push('thin narrative');
  }
  const s = parts.join(' · ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function combine(coin, narr) {
  const total = coin ? Math.round(coin.score * 0.6 + narr.score * 0.4) : narr.score;
  return { total, grade: TOTAL_GRADE(total), coin, narrative: narr, reason: reasonLine(coin, narr), weights: coin ? { coin: 0.6, narrative: 0.4 } : { coin: 0, narrative: 1 },
    disclaimer: 'Scope Score is an automated estimate from public data. The narrative part is a heuristic. Not financial advice — DYOR.', computedAt: Date.now() };
}

// ---------- signal collectors ----------
const FREE_HOSTS = /\.(vercel\.app|netlify\.app|github\.io|pages\.dev|carrd\.co|webflow\.io|wixsite\.com|framer\.(website|ai)|replit\.app|onrender\.com|glitch\.me|web\.app|firebaseapp\.com|godaddysites\.com|my\.canva\.site|notion\.site|gitbook\.io|linktr\.ee|super\.site)$/i;
const NOT_A_SITE = /(^|\.)(x\.com|twitter\.com|t\.me|telegram\.me|discord\.(gg|com)|pump\.fun|dexscreener\.com|linktr\.ee|tiktok\.com|instagram\.com|youtube\.com|youtu\.be|facebook\.com|medium\.com|github\.com|birdeye\.so|jup\.ag|wikipedia\.org|knowyourmeme\.com|reddit\.com|google\.com|solscan\.io|etherscan\.io|basescan\.org|bscscan\.com|coingecko\.com|coinmarketcap\.com)$/i;
function parseLinks(websites = [], socials = []) {
  const urls = [...websites.map(w => w.url || w), ...socials.map(s => s.url || s)].filter(u => typeof u === 'string');
  const out = { site: null, x: null, community: [], github: null };
  for (const raw of urls) {
    let u; try { u = new URL(/^https?:/i.test(raw) ? raw : 'https://' + raw); } catch { continue; }
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    const p = u.pathname.split('/').filter(Boolean);
    if (/^(x|twitter)\.com$/.test(host)) {
      if (out.x?.kind === 'account') continue;
      if (p[0] === 'i' && p[1] === 'communities') out.x = { url: u.href, kind: 'community' };
      else if (p[1] === 'status') out.x = out.x || { url: u.href, kind: 'post', handle: p[0] };
      else if (p[0] && !['search', 'hashtag', 'home', 'intent'].includes(p[0])) out.x = { url: u.href, kind: 'account', handle: p[0] };
    } else if (/^(t\.me|telegram\.me)$/.test(host)) { if (!out.community.includes('Telegram')) out.community.push('Telegram'); }
    else if (/^discord\.(gg|com)$/.test(host)) { if (!out.community.includes('Discord')) out.community.push('Discord'); }
    else if (host === 'github.com' && p.length >= 2) out.github = out.github || { repo: `${p[0]}/${p[1].replace(/\.git$/, '')}` };
    else if (host === 'github.com' && p.length === 1) out.githubOrg = out.githubOrg || p[0];
    else if (!NOT_A_SITE.test(host) && !out.site) out.site = { url: u.href, host, freeHost: FREE_HOSTS.test('.' + host) || FREE_HOSTS.test(host) };
  }
  return out;
}
function analyzeHtml(html) {
  const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1]?.trim().replace(/\s+/g, ' ') || null;
  const desc = (html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)/i) || html.match(/<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']*)/i) || [])[1] || null;
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
  const parked = /domain (is )?for sale|buy this domain|parked (free|domain)|this domain may be for sale|sedoparking|godaddy\.com\/domainsearch|hugedomains/i.test(html);
  const gh = [...html.matchAll(/github\.com\/([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})/g)].map(m => `${m[1]}/${m[2].replace(/\.git$/, '')}`).filter(r => !/^(sponsors|features|topics|orgs|login|about)\//.test(r));
  const scripts = (html.match(/<script[^>]+src=/gi) || []).length;
  return { title, description: desc, textLen: text.length, parked, scripts, githubRepo: gh[0] || null };
}

function createScorer({ getJSON, safeFetch, cached, solRpc, log = () => {} }) {
  async function siteSignals(site) {
    return cached('nsite:' + site.url, 6 * 3600e3, async () => {
      try {
        const r = await safeFetch(site.url);
        const ok = r.status >= 200 && r.status < 400;
        const a = ok && /html|text/i.test(r.headers['content-type'] || 'text/html') ? analyzeHtml(r.body) : { textLen: 0 };
        return { ...site, reachable: ok, status: r.status, ...a, error: ok ? null : 'HTTP ' + r.status };
      } catch (e) { return { ...site, reachable: false, textLen: 0, error: e.message.slice(0, 40) }; }
    });
  }
  async function domainAge(host) {
    if (!host) return null;
    const parts = host.split('.'); const apex = parts.slice(-2).join('.');
    const dom = /^(co|com|org|net|gov|ac)\.[a-z]{2}$/.test(apex) ? parts.slice(-3).join('.') : apex;
    return cached('rdap:' + dom, 24 * 3600e3, async () => {
      try {
        const r = await getJSON(`https://rdap.org/domain/${dom}`, { timeout: 8000 });
        const ev = (r.events || []).find(e => /registration/i.test(e.eventAction));
        return ev ? (Date.now() - Date.parse(ev.eventDate)) / 864e5 : null;
      } catch { return null; }
    });
  }
  async function github(repo) {
    return cached('gh:' + repo, 6 * 3600e3, async () => {
      try {
        const r = await getJSON(`https://api.github.com/repos/${repo}`, { timeout: 8000 });
        return { repo: r.full_name || repo, exists: true, stars: r.stargazers_count, pushedDaysAgo: r.pushed_at ? (Date.now() - Date.parse(r.pushed_at)) / 864e5 : null, fork: r.fork };
      } catch (e) { return /404/.test(e.message) ? { repo, exists: false } : { repo, exists: false, error: e.message }; }
    });
  }
  async function narrativeFor({ websites, socials, description }) {
    const L = parseLinks(websites, socials);
    const site = L.site ? await siteSignals(L.site) : null;
    const [age, gh] = await Promise.all([
      site && !site.freeHost ? domainAge(site.host) : null,
      (L.github?.repo || site?.githubRepo) ? github(L.github?.repo || site.githubRepo) : null,
    ]);
    return narrative({ site, domainAgeDays: age, x: L.x, community: L.community, github: gh, description: description || site?.description || '' });
  }

  // Solana launch scan: walk the mint's signatures back to its creation, look at buyers in the first 3 slots.
  async function earlyScan(mint, creator, rcTop, supply) {
    return cached('early:' + mint, 6 * 3600e3, async () => {
      let before, last = null, done = false;
      for (let page = 0; page < 4; page++) {
        const sigs = await solRpc('getSignaturesForAddress', [mint, { limit: 1000, ...(before ? { before } : {}) }]);
        if (!sigs?.length) { done = true; break; }
        last = sigs; before = sigs[sigs.length - 1].signature;
        if (sigs.length < 1000) { done = true; break; }
      }
      if (!done || !last) return { unavailable: 'Too many trades to find the launch (older/active token)' };
      const oldest = last.slice(-30).reverse().filter(s => !s.err);
      if (!oldest.length) return { unavailable: 'No launch transactions found' };
      const slot0 = oldest[0].slot;
      const win = oldest.filter(s => s.slot <= slot0 + 2).slice(0, 20);
      const txs = [];
      for (let i = 0; i < win.length; i += 5) txs.push(...await Promise.all(win.slice(i, i + 5).map(s => solRpc('getTransaction', [s.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]).catch(() => null))));
      const bought = new Map(); let decimals = null;
      for (const tx of txs) {
        if (!tx?.meta) continue;
        const pre = new Map((tx.meta.preTokenBalances || []).filter(b => b.mint === mint).map(b => [b.owner, Number(b.uiTokenAmount.amount)]));
        for (const b of (tx.meta.postTokenBalances || []).filter(b => b.mint === mint)) {
          decimals = b.uiTokenAmount.decimals;
          const d = Number(b.uiTokenAmount.amount) - (pre.get(b.owner) || 0);
          if (d > 0) bought.set(b.owner, (bought.get(b.owner) || 0) + d);
        }
      }
      // drop the bonding curve / pool accounts: anything holding more than 50% right after launch is a vault
      const total = supply ? supply : null;
      const pctOf = raw => (total ? raw / total * 100 : null);
      const vault = new Set([...bought].filter(([, v]) => pctOf(v) > 50).map(([k]) => k));
      const devInitialPct = creator && bought.has(creator) ? pctOf(bought.get(creator)) : 0;
      const snipers = [...bought].filter(([o]) => o !== creator && !vault.has(o));
      const top = new Map((rcTop || []).map(h => [h.owner, h.pct || 0]));
      const sniperHoldPct = snipers.reduce((s, [o]) => s + (top.get(o) || 0), 0);
      return { snipers: snipers.length, sniperBoughtPct: snipers.reduce((s, [, v]) => s + (pctOf(v) || 0), 0), sniperHoldPct, devInitialPct, slots: 3, scanned: txs.length, decimals };
    });
  }
  return { narrativeFor, earlyScan, siteSignals, github, domainAge };
}

module.exports = { coinSolana, coinEvm, narrative, combine, reasonLine, parseLinks, analyzeHtml, createScorer, COIN_LABEL, NARR_LABEL };
