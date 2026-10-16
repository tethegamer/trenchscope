// Chains: our key = DexScreener chainId; gt = GeckoTerminal network id (null = no list/chart source -> hidden).
const CHAINS = [
  ['solana', 'Solana', 'solana', '#14f195'], ['robinhood', 'Robinhood', 'robinhood', '#ccff00'], ['bsc', 'BNB Chain', 'bsc', '#f3ba2f'],
  ['ethereum', 'Ethereum', 'eth', '#8c9eff'], ['base', 'Base', 'base', '#2f6bff'], ['polygon', 'Polygon', 'polygon_pos', '#8247e5'],
  ['pulsechain', 'PulseChain', 'pulsechain', '#ff2fd1'], ['near', 'NEAR', 'near', '#00ec97'], ['avalanche', 'Avalanche', 'avax', '#e84142'],
  ['sonic', 'Sonic', 'sonic', '#fe9a4c'], ['starknet', 'Starknet', 'starknet-alpha', '#ec796b'], ['monad', 'Monad', 'monad', '#836ef9'],
  ['worldchain', 'World Chain', 'world-chain', '#e5e5e5'], ['hyperliquid', 'Hyperliquid', 'hyperliquid', '#97fce4'], ['hyperevm', 'HyperEVM', 'hyperevm', '#5ee6c8'],
  ['tron', 'Tron', 'tron', '#ff060a'], ['hedera', 'Hedera', 'hedera-hashgraph', '#bdbdbd'], ['ton', 'TON', 'ton', '#0098ea'],
  ['cronos', 'Cronos', 'cro', '#3d7cff'], ['sui', 'Sui', 'sui-network', '#4da2ff'], ['xrpl', 'XRPL', 'xrpl', '#cfd8dc'],
  ['ink', 'Ink', 'ink', '#7132f5'], ['arbitrum', 'Arbitrum', 'arbitrum', '#28a0f0'], ['abstract', 'Abstract', 'abstract', '#00ff7f'],
  ['optimism', 'Optimism', 'optimism', '#ff0420'], ['icp', 'Internet Computer', 'icp', '#f15a24'], ['multiversx', 'MultiversX', null, '#23f7dd'],
  ['zksync', 'zkSync', 'zksync', '#8c8dfc'], ['linea', 'Linea', 'linea', '#61dfff'], ['plasma', 'Plasma', 'plasma', '#9ad7c8'],
  ['injective', 'Injective', 'injective', '#00b2ff'],
].map(([id, name, gt, color]) => ({ id, name, gt, color }));
const SUPPORTED = CHAINS.filter(c => c.gt); // skip chains no data source supports
const byId = Object.fromEntries(SUPPORTED.map(c => [c.id, c]));
const byGt = Object.fromEntries(SUPPORTED.map(c => [c.gt, c]));
const gtSorted = SUPPORTED.map(c => c.gt).sort((a, b) => b.length - a.length);
function splitGtId(id) { // "polygon_pos_0xabc" -> { net:'polygon_pos', addr:'0xabc' }
  const net = gtSorted.find(n => id.startsWith(n + '_')) || id.slice(0, id.indexOf('_'));
  return { net, addr: id.slice(net.length + 1) };
}
module.exports = { CHAINS, SUPPORTED, byId, byGt, splitGtId };
