const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { createPresence, normalizeToken } = require('../lib/presence');
const { app, presence } = require('../server');

const BONK = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
const WIF = 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm';

test('normalizeToken handles Solana mints, chain prefixes, and EVM addresses', () => {
  assert.equal(normalizeToken(BONK), BONK);
  assert.equal(normalizeToken(BONK, 'solana'), BONK);
  assert.equal(normalizeToken('solana:' + BONK), BONK);
  assert.equal(normalizeToken('0xAbCdEf0123456789AbCdEf0123456789AbCdEf01', 'base'), 'base:0xabcdef0123456789abcdef0123456789abcdef01');
  assert.equal(normalizeToken('base:0xAbCdEf0123456789AbCdEf0123456789AbCdEf01'), 'base:0xabcdef0123456789abcdef0123456789abcdef01');
  assert.equal(normalizeToken(''), null);
  assert.equal(normalizeToken(null), null);
});

test('createPresence tracks online users, per-token viewers, switching, leave, and TTL', () => {
  let clock = 1000;
  const p = createPresence({ ttlMs: 10000, debounceMs: 0, now: () => clock });
  try {
    let snap = p.touch('tab_one', { token: BONK });
    assert.equal(snap.online, 1);
    assert.equal(snap.watching[BONK], 1);
    assert.equal(p.count(BONK), 1);

    snap = p.touch('tab_two', { token: BONK });
    assert.equal(snap.online, 2);
    assert.equal(snap.watching[BONK], 2);
    assert.equal(snap.watchingTotal, 2);

    // tab_two switches from BONK to WIF
    snap = p.touch('tab_two', { token: WIF });
    assert.equal(snap.online, 2);
    assert.equal(snap.watching[BONK], 1);
    assert.equal(snap.watching[WIF], 1);

    // tab_one closes the chart (back to screener)
    snap = p.touch('tab_one', { token: null });
    assert.equal(snap.online, 2);
    assert.equal(snap.watching[BONK], undefined);
    assert.equal(snap.watching[WIF], 1);
    assert.equal(snap.watchingTotal, 1);

    // heartbeat without token keeps current watched token
    clock += 5000;
    snap = p.touch('tab_two');
    assert.equal(snap.watching[WIF], 1);

    // advance past tab_one TTL (10s since 1000 -> 11500), while tab_two was touched at 6000
    clock = 11500;
    snap = p.snapshot();
    assert.equal(snap.online, 1);
    assert.equal(snap.watching[WIF], 1);

    // explicit leave removes tab_two immediately
    snap = p.leave('tab_two');
    assert.equal(snap.online, 0);
    assert.equal(snap.watchingTotal, 0);
  } finally {
    p.stop();
  }
});

test('HTTP /api/presence, /api/stream SSE, and /api/health work end-to-end', async () => {
  const srv = app.listen(0);
  await new Promise(r => srv.once('listening', r));
  const port = srv.address().port;
  const base = `http://127.0.0.1:${port}`;
  try {
    // Open SSE stream for viewer 1 watching BONK
    const events = [];
    const sseReq = http.get(`${base}/api/stream?sid=sse_user_1&token=${BONK}`, res => {
      res.setEncoding('utf8');
      let buf = '';
      res.on('data', chunk => {
        buf += chunk;
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const raw = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const evLine = raw.split('\n').find(l => l.startsWith('event:'));
          const dataLine = raw.split('\n').find(l => l.startsWith('data:'));
          if (evLine && dataLine) {
            events.push({
              event: evLine.slice(6).trim(),
              data: JSON.parse(dataLine.slice(5).trim()),
            });
          }
        }
      });
    });

    // Wait for initial SSE presence event
    for (let i = 0; i < 30 && !events.length; i++) await new Promise(r => setTimeout(r, 20));
    assert.ok(events.length >= 1, 'SSE client should receive initial presence event');
    assert.equal(events[0].event, 'presence');
    assert.ok(events[0].data.online >= 1);
    assert.equal(events[0].data.watching[BONK], 1);

    // Second viewer joins BONK via POST /api/presence
    const r2 = await fetch(`${base}/api/presence`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sid: 'post_user_2', token: BONK }),
    }).then(r => r.json());
    assert.equal(r2.ok, true);
    assert.equal(r2.online, 2);
    assert.equal(r2.watching[BONK], 2);
    assert.equal(r2.tokenViewers, 2);

    // Wait briefly for SSE broadcast to arrive at viewer 1
    for (let i = 0; i < 30 && !events.some(e => e.data.watching?.[BONK] === 2); i++) {
      await new Promise(r => setTimeout(r, 20));
    }
    assert.ok(events.some(e => e.data.watching?.[BONK] === 2), 'SSE stream should broadcast updated viewer count');

    // Check /api/health includes presence summary
    const h = await fetch(`${base}/api/health`).then(r => r.json());
    assert.equal(h.ok, true);
    assert.ok(h.presence);
    assert.equal(h.presence.online, 2);
    assert.equal(h.presence.watchingTotal, 2);

    // Disconnect SSE viewer 1 -> count drops to 1 immediately
    sseReq.destroy();
    await new Promise(r => setTimeout(r, 40));
    const rAfterClose = await fetch(`${base}/api/presence?token=${BONK}`).then(r => r.json());
    assert.equal(rAfterClose.online, 1);
    assert.equal(rAfterClose.tokenViewers, 1);

    // Clean up post_user_2
    await fetch(`${base}/api/presence`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sid: 'post_user_2', leave: true }),
    });
    const rFinal = await fetch(`${base}/api/presence`).then(r => r.json());
    assert.equal(rFinal.online, 0);
  } finally {
    presence.leave('sse_user_1');
    presence.leave('post_user_2');
    srv.close();
  }
});
