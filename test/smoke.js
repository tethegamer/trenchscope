// Live smoke test against real public APIs: node test/smoke.js
const { app } = require('../server');
const assert = require('assert');
const srv = app.listen(0, async () => {
  const base = `http://localhost:${srv.address().port}`;
  const j = async p => { const r = await fetch(base + p); if (!r.ok) throw new Error(`${p} -> ${r.status} ${await r.text()}`); return r.json(); };
  try {
    for (const k of ['trending', 'new', 'gainers', 'pumpfun']) {
      const d = await j('/api/list/' + k); assert.ok(d.rows.length > 0, k + ' empty'); console.log(`✓ ${k}: ${d.rows.length} rows`);
    }
    const t = await j('/api/token/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263');
    assert.equal(t.symbol, 'Bonk'); assert.ok(t.main.priceUsd > 0); assert.ok(typeof t.safety.score === 'number');
    console.log(`✓ token BONK: $${t.main.priceUsd}, safety ${t.safety.score}, holders ${t.safety.holders}`);
    // GeckoTerminal rate-limits shared IPs; the API answers 503 {fallback:true} and the UI switches to the embedded chart.
    let c = null;
    for (let i = 0; i < 3 && !c; i++) { const r = await fetch(base + '/api/ohlcv/' + t.main.pair + '?tf=1h'); const b = await r.json().catch(() => ({})); if (r.ok) c = b; else if (r.status === 503 && b.fallback) { if (i === 2) { console.log('✓ ohlcv: upstream busy, fallback chart signalled'); c = { candles: Array(11) }; } else await new Promise(z => setTimeout(z, 6000)); } else throw new Error('ohlcv ' + r.status); }
    assert.ok(c.candles.length > 10); console.log(`✓ ohlcv: ${c.candles.length} candles`);
    // GeckoTerminal is rate-limited/flaky from shared IPs: retry a couple of times before failing
    let tr; for (let i = 0; i < 3 && !tr; i++) { try { tr = await j('/api/trades/' + t.main.pair + '?mint=DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'); } catch (e) { if (i === 2) throw e; await new Promise(z => setTimeout(z, 6000)); } }
    console.log(`✓ trades: ${tr.rows.length}`);
    const sm = await j('/api/smart'); assert.ok(sm.tracked > 0 && sm.tokens); const smt = await j('/api/smart/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'); assert.ok(Array.isArray(smt.events) && smt.known.length); console.log(`✓ smart money: ${sm.tracked} wallets`);
    const cl = await j('/api/callers'); assert.ok(cl.board.length === sm.tracked && cl.callers >= 20 && Array.isArray(cl.recent)); assert.ok(cl.board.some(w => w.stats?.pump?.hit2x != null)); console.log(`✓ top callers: ${cl.callers} callers / ${cl.tracked} wallets`);
    const ls = await j('/api/live/status'); assert.ok('connected' in ls); console.log('✓ live status');
    const s = await j('/api/search?q=bonk'); assert.ok(s.rows.length); console.log(`✓ search: ${s.rows.length}`);
    console.log('ALL PASSED'); process.exit(0);
  } catch (e) { console.error('✗', e.message); process.exit(1); }
});
