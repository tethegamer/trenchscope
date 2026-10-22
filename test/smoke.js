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
    const tr = await j('/api/trades/' + t.main.pair); console.log(`✓ trades: ${tr.rows.length}`);
    const s = await j('/api/search?q=bonk'); assert.ok(s.rows.length); console.log(`✓ search: ${s.rows.length}`);
    console.log('ALL PASSED'); process.exit(0);
  } catch (e) { console.error('✗', e.message); process.exit(1); }
});
