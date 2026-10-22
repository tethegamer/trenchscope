const test = require('node:test');
const assert = require('node:assert');
const S = require('../lib/score');
const { privateIp } = require('../lib/safefetch');

const clean = { score: 90, top10: 12, top1: 3, insiderPct: 0.5, insiderClusters: 0, biggestCluster: 0, bundled: false, holders: 2500, creatorPct: 0, lpLocked: 100, isCurve: false, mintAuth: false, freezeAuth: false, transferFeePct: 0 };

test('clean Solana coin scores OK', () => {
  const c = S.coinSolana(clean, { snipers: 2, sniperBoughtPct: 1, sniperHoldPct: 0, devInitialPct: 0 });
  assert.equal(c.label, 'OK'); assert.equal(c.score, 100); assert.equal(c.items.length, 8);
  assert.equal(c.items.reduce((s, i) => s + i.max, 0), 100);
});
test('bundled / authority coins are capped', () => {
  assert.ok(S.coinSolana({ ...clean, bundled: true, insiderPct: 25, biggestCluster: 14 }).score <= 54);
  assert.ok(S.coinSolana({ ...clean, mintAuth: true }).score <= 50);
  const r = S.coinSolana({ ...clean, rugged: true });
  assert.equal(r.score, 0); assert.equal(r.label, 'RIGGED');
});
test('dev sold is detected from launch buy', () => {
  const c = S.coinSolana({ ...clean, creatorPct: 0 }, { snipers: 0, sniperHoldPct: 0, sniperBoughtPct: 0, devInitialPct: 4 });
  const dev = c.items.find(i => i.key === 'dev');
  assert.equal(dev.value, 'SOLD'); assert.equal(dev.points, 6);
});
test('EVM honeypot is RIGGED', () => {
  const c = S.coinEvm({ is_honeypot: '1', buy_tax: '0', sell_tax: '0.99', holder_count: '50' });
  assert.equal(c.label, 'RIGGED');
});
test('link parsing', () => {
  const L = S.parseLinks([{ url: 'https://coolproject.xyz' }, { url: 'https://en.wikipedia.org/wiki/Doge' }], [{ type: 'twitter', url: 'https://x.com/coolproj' }, { url: 'https://t.me/coolproj' }, { url: 'https://github.com/cool/proj' }]);
  assert.equal(L.site.host, 'coolproject.xyz'); assert.equal(L.x.kind, 'account'); assert.equal(L.x.handle, 'coolproj');
  assert.deepEqual(L.community, ['Telegram']); assert.equal(L.github.repo, 'cool/proj');
  assert.equal(S.parseLinks([], [{ url: 'https://x.com/i/communities/123' }]).x.kind, 'community');
  assert.equal(S.parseLinks([{ url: 'https://foo.vercel.app' }]).site.freeHost, true);
});
test('narrative labels', () => {
  assert.equal(S.narrative({}).label, 'LIKELY LARP');
  const real = S.narrative({ site: { host: 'a.xyz', reachable: true, textLen: 2000, title: 'A' }, domainAgeDays: 400, x: { kind: 'account', handle: 'a' }, community: ['Telegram'], github: { repo: 'a/b', exists: true, pushedDaysAgo: 3 }, description: 'A real project with a long description here.' });
  assert.equal(real.score, 100); assert.equal(real.label, 'LIKELY REAL');
});
test('combine = 60/40 with reason + disclaimer', () => {
  const r = S.combine(S.coinSolana(clean), S.narrative({}));
  assert.equal(r.total, Math.round(r.coin.score * 0.6));
  assert.match(r.reason, /no website or socials/); assert.match(r.disclaimer, /DYOR/);
});
test('html analysis + parked detection', () => {
  const a = S.analyzeHtml('<title>Hi</title><p>' + 'x'.repeat(900) + '</p><a href="https://github.com/team/repo">gh</a>');
  assert.equal(a.title, 'Hi'); assert.ok(a.textLen > 800); assert.equal(a.githubRepo, 'team/repo');
  assert.ok(S.analyzeHtml('This domain is for sale!').parked);
});
test('SSRF guard blocks private ranges', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.1', '172.20.0.1', '169.254.169.254', '::1', '::ffff:127.0.0.1', 'fd00::1']) assert.ok(privateIp(ip), ip);
  assert.ok(!privateIp('8.8.8.8'));
});
