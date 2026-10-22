'use strict';
// Jupiter Plugin ("buy on site") config. Swaps run fully in Jupiter's widget: the user's own wallet signs,
// we never touch keys or funds. A referral fee is only added once JUP_REFERRAL_ACCOUNT is set (see docs/jupiter-referral.md).
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58len(s) {
  if (typeof s !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s)) return -1;
  let n = 0n; for (const c of s) n = n * 58n + BigInt(B58.indexOf(c));
  let h = n.toString(16); if (h.length % 2) h = '0' + h; if (n === 0n) h = '';
  let z = 0; for (const c of s) { if (c === '1') z++; else break; }
  return h.length / 2 + z;
}
function jupiterConfig(env = process.env, log = console) {
  const plugin = env.JUP_PLUGIN !== '0';
  const raw = (env.JUP_REFERRAL_ACCOUNT || '').trim();
  let referralAccount = null;
  if (raw) { if (b58len(raw) === 32) referralAccount = raw; else log.warn?.('[jupiter] JUP_REFERRAL_ACCOUNT is not a valid Solana address; referral fees disabled'); }
  // Jupiter Ultra accepts 50-255 bps for integrator fees (Jupiter keeps 20% of it)
  let feeBps = Math.round(+(env.JUP_REFERRAL_FEE_BPS || 50));
  if (!Number.isFinite(feeBps)) feeBps = 50;
  if (feeBps < 50 || feeBps > 255) { log.warn?.(`[jupiter] JUP_REFERRAL_FEE_BPS=${env.JUP_REFERRAL_FEE_BPS} outside 50-255; clamped`); feeBps = Math.min(255, Math.max(50, feeBps)); }
  return { plugin, referralAccount, feeBps: referralAccount ? feeBps : 0, script: 'https://plugin.jup.ag/plugin-v1.js' };
}
module.exports = { jupiterConfig, b58len };
