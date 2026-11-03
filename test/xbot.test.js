const test = require('node:test');
const assert = require('node:assert');
const os = require('os'), path = require('path'), fs = require('fs');
const { createXBot, extractCA, replyText } = require('../lib/xbot');

const BONK = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
test('extract CA from text, links and EVM', () => {
  assert.deepEqual(extractCA(`@OnTheScope check ${BONK} pls`), { address: BONK, chain: 'solana' });
  assert.equal(extractCA('', [`https://pump.fun/coin/${BONK}`]).address, BONK);
  assert.equal(extractCA('', [`https://onthescope.fun/token/${BONK}`]).address, BONK);
  assert.equal(extractCA('', ['https://onthescope.fun/token/base/0x532f27101965dd16442E59d40670FaF5eBB142E4']).address, '0x532f27101965dd16442E59d40670FaF5eBB142E4');
  const d = extractCA('', ['https://dexscreener.com/base/0x1111111111111111111111111111111111111111']);
  assert.equal(d.chain, 'base'); assert.equal(d.viaPair, true);
  assert.equal(extractCA('ape 0x532f27101965dd16442E59d40670FaF5eBB142E4 now').address, '0x532f27101965dd16442E59d40670FaF5eBB142E4');
  assert.equal(extractCA('gm frens no address here, just vibes and words'), null);
});
const sample = { address: BONK, symbol: 'Bonk', total: 78, reason: 'Top 10 wallets hold 38% · real project footprint', coin: { score: 80, label: 'OK', caps: [], items: [] }, narrative: { score: 75, label: 'LIKELY REAL' } };
test('reply fits in 280 chars', () => {
  const t = replyText(sample, 'https://onthescope.fun/token/' + BONK);
  assert.match(t, /\$Bonk Scope Score: 78\/100/); assert.match(t, /DYOR/);
  assert.ok(t.replace(/https?:\/\/\S+/g, 'x'.repeat(23)).length <= 280);
  const long = replyText({ ...sample, reason: 'x'.repeat(300), coin: { ...sample.coin, caps: ['y'.repeat(200)] } }, 'https://a.b/token/x');
  assert.ok(long.replace(/https?:\/\/\S+/g, 'x'.repeat(23)).length <= 280);
});
test('disabled without keys', () => {
  const b = createXBot({ env: {}, scoreFor() {}, resolveChain() {}, baseUrl: () => '' });
  assert.equal(b.status.enabled, false);
});
test('polls mentions, skips backlog, replies once with link', async () => {
  const calls = [];
  let round = 0;
  const fake = async (url, opt) => {
    calls.push({ url, opt });
    assert.match(opt.headers.Authorization, /^OAuth oauth_consumer_key="k"/);
    const json = d => ({ ok: true, status: 200, headers: new Map([['x-rate-limit-remaining', '100']]), json: async () => d });
    if (url.endsWith('/users/me')) return json({ data: { id: '42', username: 'OnTheScope' } });
    if (url.includes('/mentions')) return round++ === 0 ? json({ data: [{ id: '5', text: 'old', author_id: '7' }], meta: { newest_id: '5' } })
      : json({ data: [{ id: '9', text: '@OnTheScope score this?', author_id: '7', referenced_tweets: [{ type: 'replied_to', id: '8' }] }], includes: { tweets: [{ id: '8', text: 'new gem ' + BONK }] }, meta: { newest_id: '9' } });
    if (url.endsWith('/tweets')) return json({ data: { id: '10' } });
    throw new Error('unexpected ' + url);
  };
  const stateFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'xb')), 's.json');
  const b = createXBot({ env: { X_API_KEY: 'k', X_API_SECRET: 's', X_ACCESS_TOKEN: 't', X_ACCESS_SECRET: 'a' }, fetchImpl: fake, stateFile, log: { log() {}, warn() {} },
    scoreFor: async (c, a) => ({ ...sample, address: a }), resolveChain: async ca => ({ chain: 'solana', address: ca.address }), baseUrl: () => 'https://ots.example' });
  await b.poll(); // first run: backlog skipped
  assert.ok(!calls.some(c => c.url.endsWith('/tweets')));
  await b.poll();
  const post = calls.find(c => c.url.endsWith('/tweets'));
  const body = JSON.parse(post.opt.body);
  assert.equal(body.reply.in_reply_to_tweet_id, '9');
  assert.match(body.text, new RegExp('https://ots.example/token/' + BONK));
  assert.match(calls.filter(c => c.url.includes('/mentions')).pop().url, /since_id=5/);
  assert.equal(JSON.parse(fs.readFileSync(stateFile, 'utf8')).sinceId, '9');
});

const { announceText, handleFromUrl } = require('../lib/xbot');
const len = t => t.replace(/https?:\/\/\S+/g, 'x'.repeat(23)).length;
const intel = { og: { status: 'vamp', og: { symbol: 'BONK' }, vv: false, ratio: 1.6 }, kols: { buyers: ['Ansem', 'Cented', 'Orangie', 'Gake'], tracked: true }, scoped: { handle: '@bonk_inu' } };
test('reply adds OG/VAMP, KOL buys and Scoped lines, still <= 280', () => {
  const t = replyText(sample, 'https://onthescope.fun/token/' + BONK, intel);
  assert.match(t, /🧛 VAMP: copycat of \$BONK/);
  assert.match(t, /KOL buys \(24h\): Ansem, Cented, Orangie \+1/);
  assert.match(t, /✅ Scoped project · @bonk_inu/);
  assert.ok(len(t) <= 280);
  const og = replyText(sample, 'https://a.b/t', { og: { status: 'og', vamps: 3 } });
  assert.match(og, /👑 OG: first to graduate with this name \(3 copycats\)/);
  // overflow drops the least important lines first: score + copycat + KOL survive
  const big = replyText({ ...sample, reason: 'r'.repeat(200), coin: { ...sample.coin, caps: ['c'.repeat(120)] } }, 'https://a.b/t', intel);
  assert.ok(len(big) <= 280); assert.match(big, /Scope Score/); assert.match(big, /VAMP/); assert.match(big, /KOL buys/);
  assert.ok(!/r{50}/.test(big));
});
test('handle from Scoped X url', () => {
  assert.equal(handleFromUrl('https://x.com/bonk_inu'), '@bonk_inu');
  assert.equal(handleFromUrl('https://twitter.com/bonk_inu/status/1'), '@bonk_inu');
  assert.equal(handleFromUrl('https://x.com/i/communities/123'), null);
  assert.equal(handleFromUrl('https://evil.com/x.com/a'), null);
});
test('announces each new Scoped listing once (counts toward the cap)', async () => {
  const posts = [];
  const json = d => ({ ok: true, status: 200, headers: new Map([['x-rate-limit-remaining', '100']]), json: async () => d });
  const fake = async (url, opt) => {
    if (url.endsWith('/users/me')) return json({ data: { id: '42', username: 'OnTheScope' } });
    if (url.includes('/mentions')) return json({ meta: {} });
    if (url.endsWith('/tweets')) { posts.push(JSON.parse(opt.body)); return json({ data: { id: '11' } }); }
    throw new Error('unexpected ' + url);
  };
  const stateFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'xb')), 's.json');
  const mk = () => createXBot({ env: { X_API_KEY: 'k', X_API_SECRET: 's', X_ACCESS_TOKEN: 't', X_ACCESS_SECRET: 'a' }, fetchImpl: fake, stateFile, log: { log() {}, warn() {} },
    scoreFor: async (c, a) => ({ ...sample, address: a }), resolveChain: async () => null, baseUrl: () => 'https://ots.example',
    intelFor: async () => intel, scopedQueue: () => [{ id: 'o1', mint: BONK }] });
  const b = mk();
  assert.equal(await b.announceNext(), 'announced');
  assert.equal(await b.announceNext(), 'none');
  assert.equal(posts.length, 1);
  assert.match(posts[0].text, /Newly Scoped on On the Scope: \$Bonk @bonk_inu/);
  assert.match(posts[0].text, new RegExp('https://ots.example/token/' + BONK));
  assert.ok(len(posts[0].text) <= 280);
  assert.equal(await mk().announceNext(), 'none'); // persisted across restarts
  assert.equal(b.status.announced, 1);
  assert.ok(announceText({ ...sample, symbol: 'Z' }, 'https://a.b/t', {}).includes('$Z'));
});

test('a Valid Vamp is never labelled VAMP / copycat (reply, trust flags)', () => {
  const t = replyText(sample, 'https://a.b/t', { og: { status: 'vamp', og: { symbol: 'BONK' }, vv: true, ratio: 3.4 } });
  assert.doesNotMatch(t, /VAMP|copycat/); assert.match(t, /Valid Vamp: flipped \$BONK 3\.4x/);
  const { flagsOf } = require('../lib/trust');
  assert.deepEqual(flagsOf({ og: { status: 'vamp', vv: true } }), []);
  assert.deepEqual(flagsOf({ og: { status: 'vamp', vv: false } }), ['copycat']);
});
