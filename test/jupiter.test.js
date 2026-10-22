'use strict';
const test = require('node:test'); const assert = require('node:assert');
const { jupiterConfig, b58len } = require('../lib/jupiter');
const quiet = { warn() {} };
test('jupiter: no referral until JUP_REFERRAL_ACCOUNT is set', () => {
  assert.deepEqual(jupiterConfig({}, quiet), { plugin: true, referralAccount: null, feeBps: 0, script: 'https://plugin.jup.ag/plugin-v1.js' });
  assert.equal(jupiterConfig({ JUP_PLUGIN: '0' }, quiet).plugin, false);
});
test('jupiter: referral account validated, fee defaults to 50 and is clamped to 50-255', () => {
  const acct = 'EL63Jz5kAamGAFtwiunvCJsFcAZWGUmagPTHZTrcPVv6';
  assert.equal(b58len(acct), 32);
  assert.equal(jupiterConfig({ JUP_REFERRAL_ACCOUNT: acct }, quiet).feeBps, 50);
  assert.equal(jupiterConfig({ JUP_REFERRAL_ACCOUNT: acct, JUP_REFERRAL_FEE_BPS: '100' }, quiet).feeBps, 100);
  assert.equal(jupiterConfig({ JUP_REFERRAL_ACCOUNT: acct, JUP_REFERRAL_FEE_BPS: '999' }, quiet).feeBps, 255);
  assert.equal(jupiterConfig({ JUP_REFERRAL_ACCOUNT: acct, JUP_REFERRAL_FEE_BPS: '10' }, quiet).feeBps, 50);
  assert.equal(jupiterConfig({ JUP_REFERRAL_ACCOUNT: 'not-a-key' }, quiet).referralAccount, null);
});
