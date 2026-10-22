const test = require('node:test');
const assert = require('node:assert');
const os = require('os'), path = require('path'), fs = require('fs');
const { createXBot, extractCA, replyText } = require('../lib/xbot');

const BONK = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
test('extract CA from text, links and EVM', () => {
  assert.deepEqual(extractCA(`@OnTheScope check ${BONK} pls`), { address: BONK, chain: 'solana' });
  assert.equal(extractCA('', [`https://pump.fun/coin/${BONK}`]).address, BONK);
  const d = extractCA('', ['https://dexscreener.com/base/0x1111111111111111111111111111111111111111']);
  assert.equal(d.chain, 'base'); assert.equal(d.viaPair, true);
  assert.equal(extractCA('ape 0x532f27101965dd16442E59d40670FaF5eBB142E4 now').address, '0x532f27101965dd16442E59d40670FaF5eBB142E4');
  assert.equal(extractCA('gm frens no address here, just vibes and words'), null);
});
const sample = { address: BONK, symbol: 'Bonk', total: 78, reason: 'Top 10 wallets hold 38% · real project footprint', coin: { score: 80, label: 'OK', caps: [], items: [] }, narrative: { score: 75, label: 'LIKELY REAL' } };
test('reply fits in 280 chars', () => {
  const t = replyText(sample, 'https://example.onrender.com/token/' + BONK);
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
