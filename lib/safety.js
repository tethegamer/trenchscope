// Safety scoring for Solana tokens. Idea adapted from SafeSign's scanner (RugCheck + GoPlus),
// extended with holder-concentration (excluding pools/lockers), dev wallet and bundle heuristics.
// Every number here comes straight from RugCheck/GoPlus; nothing is invented. If data is missing, the field is null.

function scoreReport(rc, gp) {
  if (!rc) return { unavailable: true };
  const flags = [];
  let penalty = 0;
  const add = (level, title, detail, w = 0) => { flags.push({ level, title, detail }); penalty += w; };
  const supply = Number(rc.token?.supply) || null;

  const mintAuth = !!(rc.mintAuthority || rc.token?.mintAuthority);
  const freezeAuth = !!(rc.freezeAuthority || rc.token?.freezeAuthority);
  mintAuth ? add('danger', 'Mint authority active', 'Creator can mint unlimited new supply.', 30) : add('ok', 'Mint revoked', 'Supply is fixed.');
  freezeAuth ? add('danger', 'Freeze authority active', 'Creator can freeze holder wallets (honeypot risk).', 30) : add('ok', 'Freeze revoked', 'Nobody can freeze your tokens.');

  // holders: exclude AMM pools, lockers and market accounts so the % reflects real wallets
  const known = rc.knownAccounts || {};
  const marketKeys = new Set();
  for (const m of rc.markets || []) [m.pubkey, m.liquidityA, m.liquidityB, m.liquidityAAccount, m.liquidityBAccount].forEach(k => k && marketKeys.add(k));
  const BURN = new Set(['11111111111111111111111111111111', '1nc1nerator11111111111111111111111111111111']);
  const holders = (rc.topHolders || []).filter(h => !BURN.has(h.owner) && !known[h.owner] && !known[h.address] && !marketKeys.has(h.owner) && !marketKeys.has(h.address));
  const top10 = holders.length ? holders.slice(0, 10).reduce((s, h) => s + (h.pct || 0), 0) : null;
  const top1 = holders.length ? holders[0].pct || 0 : null;
  if (top10 != null) {
    if (top10 > 50) add('danger', 'Very concentrated', `Top 10 wallets (excl. pools/lockers) hold ${top10.toFixed(1)}%.`, 20);
    else if (top10 > 30) add('warn', 'Concentrated', `Top 10 wallets hold ${top10.toFixed(1)}%.`, 10);
    else add('ok', 'Distributed', `Top 10 wallets hold ${top10.toFixed(1)}%.`);
    if (top1 > 10) add('warn', 'Whale wallet', `Largest wallet holds ${top1.toFixed(1)}%.`, 6);
  }

  // LP
  const lpVals = (rc.markets || []).map(m => m.lp?.lpLockedPct).filter(x => typeof x === 'number');
  const lpLocked = lpVals.length ? Math.max(...lpVals) : (typeof rc.lpLockedPct === 'number' ? rc.lpLockedPct : null);
  const isCurve = (rc.markets || []).length === 0 && /pump/i.test(rc.launchpad?.platform || '');
  if (lpLocked != null) {
    if (lpLocked >= 90) add('ok', 'LP locked/burned', `${lpLocked.toFixed(0)}% of LP locked or burned.`);
    else if (lpLocked >= 50) add('warn', 'LP partly unlocked', `${lpLocked.toFixed(0)}% of LP locked.`, 6);
    else add('warn', 'LP unlocked', `Only ${lpLocked.toFixed(0)}% of LP locked — liquidity can be pulled.`, 12);
  }

  // dev wallet
  const creatorPct = supply && rc.creatorBalance != null ? (Number(rc.creatorBalance) / supply) * 100 : null;
  if (creatorPct != null && creatorPct > 5) add('warn', 'Dev holds a lot', `Creator wallet holds ${creatorPct.toFixed(1)}% of supply.`, creatorPct > 15 ? 12 : 6);

  // bundle / insider heuristic (RugCheck transfer-graph networks)
  // Very large "networks" (hundreds+ of wallets) are usually exchange/pool transfer graphs, not bundles — ignore them,
  // and drop any network whose reported holding exceeds supply (inconsistent data).
  const nets = (rc.insiderNetworks || []).filter(n => {
    const sz = n.activeAccounts || n.size || 0;
    return sz >= 2 && sz <= 200 && (!supply || Number(n.currentHolding) <= supply);
  });
  const insiderPct = supply && nets.length ? Math.min(100, nets.reduce((s, n) => s + (Number(n.currentHolding) || 0), 0) / supply * 100) : (nets.length ? null : 0);
  const biggestNet = nets.reduce((m, n) => Math.max(m, n.activeAccounts || n.size || 0), 0);
  const insidersInTop = (rc.topHolders || []).filter(h => h.insider).reduce((s, h) => s + (h.pct || 0), 0);
  const bundled = (insiderPct != null && insiderPct >= 15) || insidersInTop >= 10 || (biggestNet >= 10 && (insiderPct || 0) >= 5);
  if (bundled) add('danger', 'Bundle / insider cluster', `Linked wallet clusters hold ${insiderPct != null ? insiderPct.toFixed(1) + '%' : 'an unknown share'} of supply (largest cluster: ${biggestNet} wallets). Typical of bundled launches or sniper groups.`, 18);
  else if ((insiderPct || 0) >= 5) add('warn', 'Insider wallets', `Linked wallet clusters hold ${insiderPct.toFixed(1)}% of supply.`, 6);

  if (rc.rugged) add('danger', 'Flagged RUGGED', 'RugCheck marks this token as rugged.', 60);
  const tf = rc.transferFee?.pct || 0;
  if (tf > 0) add('warn', 'Transfer fee', `${tf}% fee on every transfer.`, 10);
  if (gp) {
    if (gp.non_transferable === '1') add('danger', 'Non-transferable', 'GoPlus: token cannot be transferred.', 40);
    if (gp.balance_mutable_authority?.status === '1') add('danger', 'Balance mutable', 'GoPlus: an authority can change balances.', 30);
    if (gp.closable?.status === '1') add('warn', 'Closable', 'GoPlus: token accounts can be closed by an authority.', 8);
  }
  for (const r of rc.risks || []) {
    if (/mint authority|freeze authority|top 10|single holder|lp|liquidity|creator|insider|rugged/i.test(r.name)) continue;
    add(r.level === 'danger' ? 'danger' : 'warn', r.name, r.description || '', r.level === 'danger' ? 10 : 2);
  }

  // a bundled launch or live mint/freeze authority can never be graded "safe"
  let score = Math.max(0, Math.min(100, Math.round(100 - penalty)));
  if (bundled || mintAuth || freezeAuth || rc.rugged) score = Math.min(score, 65);
  const grade = score >= 80 ? 'safe' : score >= 55 ? 'caution' : 'danger';
  return {
    score, grade, mintAuth, freezeAuth, top10, top1, lpLocked, isCurve, bundled,
    insiderPct, insiderClusters: nets.length, biggestCluster: biggestNet,
    holders: rc.totalHolders ?? null, creator: rc.creator || null, creatorPct,
    creatorTokens: Array.isArray(rc.creatorTokens) ? rc.creatorTokens.length : null,
    launchpad: rc.launchpad?.name || null, rugged: !!rc.rugged, transferFeePct: tf, supply, rugcheckScore: rc.score_normalised ?? null,
    topHolders: holders.slice(0, 15).map(h => ({ owner: h.owner, pct: h.pct, insider: !!h.insider })),
    name: rc.tokenMeta?.name, symbol: rc.tokenMeta?.symbol,
    flags, checkedAt: Date.now(),
  };
}
module.exports = { scoreReport };
