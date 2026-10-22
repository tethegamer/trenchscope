// Browser side of alerts: keeps the server's copy of your watchlist / wallets / price targets in sync so web push and
// Telegram alerts fire even when this tab is closed. Everything is keyed by a random id stored only in this browser.
const DEFAULT_PREFS = { moves: true, movePct: 10, targets: true, wallets: true, vv: true, og: false };
let LS, getState, onFired, cfg = null, last = null, timer = null, inflight = null;
const listeners = new Set();
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function sid() {
  let s = LS.get('sid', null);
  if (!/^[a-f0-9]{32}$/.test(s || '')) { s = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join(''); LS.set('sid', s); }
  return s;
}
export const prefs = () => ({ ...DEFAULT_PREFS, ...LS.get('alertPrefs', {}) });
export const state = () => last;
export const onChange = f => { listeners.add(f); return () => listeners.delete(f); };
const b64ToU8 = b => { const p = '='.repeat((4 - b.length % 4) % 4); const r = atob((b + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, c => c.charCodeAt(0)); };
async function post(url, body) { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status); return j; }
export async function config() { if (!cfg) cfg = await fetch('/api/alerts/config').then(r => r.json()); return cfg; }
export const remoteActive = () => !!(last && (last.push || last.telegram?.linked));
async function currentSub() { if (!pushSupported()) return null; const reg = await navigator.serviceWorker.getRegistration(); return reg ? reg.pushManager.getSubscription() : null; }

export async function syncNow(extra = {}) {
  const { watch, wallets, targets } = getState();
  const body = { sid: sid(), prefs: prefs(), watch, wallets, targets, tgLink: LS.get('tgLink', null), ...extra };
  if (!('push' in extra) && LS.get('pushOn', false)) {
    try {
      const sub = await currentSub(); const c = await config();
      if (sub && LS.get('vapidKey', null) === c.vapidPublicKey) body.push = sub.toJSON();
      else if (Notification.permission === 'granted') { const s = await subscribe(); if (s) body.push = s; } // server keys changed: resubscribe
    } catch {}
  }
  const p = (inflight || Promise.resolve()).catch(() => {}).then(() => post('/api/alerts/sync', body));
  inflight = p;
  const r = await p;
  last = r;
  if (r.telegram?.link) LS.set('tgLink', r.telegram.link);
  if (r.fired?.length) onFired?.(r.fired);
  listeners.forEach(f => { try { f(r); } catch {} });
  return r;
}
export function scheduleSync(ms = 1500) { if (!LS || !(LS.get('pushOn', false) || LS.get('tgLink', null) || LS.get('sid', null) || LS.get('wallets', []).length)) return; clearTimeout(timer); timer = setTimeout(() => syncNow().catch(() => {}), ms); }

async function subscribe() {
  const c = await config(); const reg = await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (sub && LS.get('vapidKey', null) !== c.vapidPublicKey) { await sub.unsubscribe().catch(() => {}); sub = null; }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(c.vapidPublicKey) });
  LS.set('vapidKey', c.vapidPublicKey);
  return sub.toJSON();
}
export async function enablePush() {
  if (!pushSupported()) throw new Error(isIOS() && !isStandalone() ? 'On iPhone, add the site to your Home Screen first (Share → Add to Home Screen), then open it from there.' : 'This browser does not support push notifications.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Notifications are blocked for this site. Allow them in your browser’s site settings, then try again.' : 'Permission was not granted.');
  const push = await subscribe(); LS.set('pushOn', true);
  return syncNow({ push });
}
export async function disablePush() { const s = await currentSub().catch(() => null); await s?.unsubscribe().catch(() => {}); LS.set('pushOn', false); return syncNow({ push: null }); }
export async function unlinkTelegram() { LS.set('tgLink', null); return syncNow({ tgUnlink: true, tgLink: null }); }
export const sendTest = () => post('/api/alerts/test', { sid: sid() });
export function setPrefs(p) { LS.set('alertPrefs', { ...prefs(), ...p }); scheduleSync(300); }

export function initAlerts(opts) {
  ({ LS, getState, onFired } = opts);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  // only talk to the server when this browser has opted into remote alerts at some point
  if (LS.get('pushOn', false) || LS.get('tgLink', null) || LS.get('sid', null) || LS.get('wallets', []).length) scheduleSync(2500); // wallets: so the server can tag their trades
  setInterval(() => { if (remoteActive()) syncNow().catch(() => {}); }, 5 * 60e3); // pick up fired targets
}
