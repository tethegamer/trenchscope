const test = require('node:test');
const assert = require('node:assert');
const { trustRank, activity, scoreOf, boostMinScore } = require('../lib/trust');

const row = (mint, o = {}) => ({ mint, liquidity: 50000, txns: { h1: { buys: 60, sells: 40 }, h24: { buys: 900, sells: 700 } }, volume: { h1: 20000, h24: 300000 }, ...o });
test('activity rewards organic flow and damps thin / wash-like pools', () => {
  const base = activity(row('a'));
  assert.ok(base > 0);
  assert.ok(activity(row('b', { liquidity: 500 })) < base); // no liquidity
  assert.ok(activity(row('c', { volume: { h1: 2e6, h24: 4e7 } })) < activity(row('c2', { volume: { h1: 2e6, h24: 4e7 }, liquidity: 2e6 }))); // vol/liq wash
  assert.equal(activity({ mint: 'z' }), 0);
});
test('scoreOf falls back from Scope Score to safety to neutral', () => {
  assert.equal(scoreOf({ score: { t: 80 } }), 80);
  assert.equal(scoreOf({ safety: { score: 50 } }), 40);
  assert.equal(scoreOf({}), 35);
});
test('organic + score beats paid boosts; ads are pinned, capped and score-gated', () => {
  const rows = [
    row('hot-good', { score: { t: 85 } }),
    row('hot-bad', { score: { t: 10 } }),
    row('dead-paid', { txns: { h1: { buys: 1, sells: 0 }, h24: { buys: 5, sells: 2 } }, volume: { h1: 10, h24: 300 }, score: { t: 70 }, promo: 100 }),
    row('paid-junk', { score: { t: 20 }, promo: 500 }),
    row('danger', { score: { t: 90 }, safety: { grade: 'danger', score: 10 } }),
    row('ds-only', { score: { t: 85 }, dsOnly: true, boosts: 500 }),
  ];
  const r = trustRank(rows, { minScore: 50, promoSlots: 1 });
  assert.equal(r[0].mint, 'dead-paid'); assert.equal(r[0].pinned, true); // labelled AD slot, eligible
  assert.equal(r[1].mint, 'hot-good');
  const junk = r.find(x => x.mint === 'paid-junk');
  assert.equal(junk.pinned, false); // paid but below the threshold: no lift
  assert.ok(r.indexOf(junk) > r.indexOf(r.find(x => x.mint === 'hot-good')));
  assert.ok(r.findIndex(x => x.mint === 'danger') > r.findIndex(x => x.mint === 'hot-good'));
  assert.ok(r.find(x => x.mint === 'ds-only').trust < r.find(x => x.mint === 'hot-good').trust); // DexScreener-paid only: no lift
  assert.equal(trustRank(rows, { minScore: 50, promoSlots: 0 }).filter(x => x.pinned).length, 0);
  assert.equal(r.length, rows.length);
});
test('BOOST_MIN_SCORE parsing', () => {
  assert.equal(boostMinScore({}), 50);
  assert.equal(boostMinScore({ BOOST_MIN_SCORE: '65' }), 65);
  assert.equal(boostMinScore({ BOOST_MIN_SCORE: '0' }), 0);
  assert.equal(boostMinScore({ BOOST_MIN_SCORE: 'abc' }), 50);
  assert.equal(boostMinScore({ BOOST_MIN_SCORE: '500' }), 100);
});
