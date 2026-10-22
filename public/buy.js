// Buy on site: Jupiter Plugin (https://dev.jup.ag/tool-kits/plugin) embedded on Solana token pages.
// The user's own wallet signs inside Jupiter's widget; we never see keys or funds.
// If the plugin is disabled or fails to load, the plain "Open on jup.ag" link still works.
const SOL = 'So11111111111111111111111111111111111111112';
let cfgP = null, scriptP = null;
export const config = () => cfgP || (cfgP = fetch('/api/config').then(r => r.json()).then(d => d.jup || {}).catch(() => ({ plugin: false })));
function loadScript(src) {
  if (window.Jupiter) return Promise.resolve();
  return scriptP || (scriptP = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.async = true; s.dataset.preload = '';
    s.onload = () => (window.Jupiter ? res() : rej(new Error('Jupiter did not start')));
    s.onerror = () => { scriptP = null; rej(new Error('could not load Jupiter')); };
    document.head.appendChild(s);
    setTimeout(() => rej(new Error('Jupiter took too long to load')), 15000);
  }));
}
export async function feeNote() {
  const c = await config();
  return c.referralAccount ? `Includes a ${(c.feeBps / 100).toFixed(c.feeBps % 100 ? 2 : 1)}% On the Scope fee, plus Jupiter's own fee.` : '';
}
// mount the integrated swap form into #targetId, buying `mint` with SOL
export async function mountBuy(targetId, { mint, onSuccess }) {
  const c = await config();
  if (!c.plugin) throw new Error('on-site buying is turned off');
  await loadScript(c.script || 'https://plugin.jup.ag/plugin-v1.js');
  if (!document.getElementById(targetId)) return;
  const formProps = { initialInputMint: SOL, initialOutputMint: mint };
  if (c.referralAccount) { formProps.referralAccount = c.referralAccount; formProps.referralFee = c.feeBps; }
  window.Jupiter.init({
    displayMode: 'integrated', integratedTargetId: targetId,
    formProps, defaultExplorer: 'Solscan',
    branding: { name: 'On the Scope', logoUri: location.origin + '/icon-192.png' },
    containerStyles: { width: '100%', borderRadius: '12px', overflow: 'hidden' },
    onSuccess: ({ txid }) => onSuccess && onSuccess(txid),
  });
}
export function unmount() { try { window.Jupiter?.close?.(); } catch {} }
