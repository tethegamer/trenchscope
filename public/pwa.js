// Install as an app (PWA): Android/desktop Chrome get the native install prompt; iPhone/iPad get
// step-by-step "Add to Home Screen" instructions (Safari has no install prompt).
let deferred = null;
const LSK = 'ts:installDismissed';
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const canInstall = () => !isStandalone() && (!!deferred || isIOS());
const listeners = [];
const changed = () => listeners.forEach(f => { try { f(); } catch {} });
export const onChange = f => listeners.push(f);

function sheet(html) {
  document.querySelector('.inst-sheet')?.remove();
  const d = document.createElement('div'); d.className = 'inst-sheet'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
  d.innerHTML = `<div class="inst-card"><button class="inst-x" aria-label="Close">✕</button>${html}</div>`;
  d.onclick = e => { if (e.target === d || e.target.closest('.inst-x') || e.target.closest('[data-close]')) d.remove(); };
  document.body.appendChild(d); return d;
}
export function iosSteps() {
  const inSafari = /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS|FBAN|FBAV|Instagram|Line|Twitter/.test(navigator.userAgent);
  return `<img src="/icon-192.png" alt="" width="56" height="56" class="inst-ico"><h3>Add On the Scope to your Home Screen</h3>
  ${inSafari ? '' : '<p class="inst-warn">Open this page in <b>Safari</b> first. In-app browsers (X, Telegram, Instagram) can\'t install apps.</p>'}
  <ol class="inst-steps">
    <li><span class="inst-n">1</span><div>Tap the <b>Share</b> button <span class="inst-share" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 2 7.5 6.5l1.4 1.4L11 5.8V15h2V5.8l2.1 2.1 1.4-1.4L12 2ZM5 10v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10h-2v10H7V10H5Z"/></svg></span> at the bottom of Safari (top-right on iPad)</div></li>
    <li><span class="inst-n">2</span><div>Scroll down and tap <b>Add to Home Screen</b> <span class="inst-plus" aria-hidden="true">＋</span></div></li>
    <li><span class="inst-n">3</span><div>Tap <b>Add</b>, then open <b>On the Scope</b> from your Home Screen</div></li>
  </ol>
  <p class="mut inst-foot">This also unlocks push alerts on iPhone (iOS 16.4+).</p><button class="btn pri" data-close style="width:100%;justify-content:center">Got it</button>`;
}
export async function install() {
  if (isStandalone()) return 'installed';
  if (deferred) {
    const p = deferred; deferred = null; changed();
    p.prompt(); const r = await p.userChoice.catch(() => ({ outcome: 'dismissed' }));
    return r.outcome;
  }
  if (isIOS()) { sheet(iosSteps()); return 'ios'; }
  sheet(`<img src="/icon-192.png" alt="" width="56" height="56" class="inst-ico"><h3>Install On the Scope</h3><ol class="inst-steps"><li><span class="inst-n">1</span><div>Open your browser menu (<b>⋮</b> or <b>⋯</b>)</div></li><li><span class="inst-n">2</span><div>Choose <b>Install app</b> or <b>Add to Home screen</b></div></li></ol><p class="mut inst-foot">Chrome, Edge, Samsung Internet and Brave support this. Firefox desktop doesn't.</p><button class="btn pri" data-close style="width:100%;justify-content:center">OK</button>`);
  return 'manual';
}
function banner(toast) {
  if (!canInstall() || document.querySelector('.inst-banner')) return;
  const until = +localStorage.getItem(LSK) || 0; if (Date.now() < until) return;
  const b = document.createElement('div'); b.className = 'inst-banner';
  b.innerHTML = `<img src="/icon-192.png" alt="" width="34" height="34"><div><b>Get the app</b><span>Home Screen icon, full screen, instant alerts</span></div><button class="btn pri" data-i>Install</button><button class="inst-x" aria-label="Not now">✕</button>`;
  b.querySelector('[data-i]').onclick = async () => { const r = await install(); if (r !== 'ios' && r !== 'manual') b.remove(); };
  b.querySelector('.inst-x').onclick = () => { localStorage.setItem(LSK, Date.now() + 14 * 864e5); b.remove(); };
  document.body.appendChild(b);
}
export function initPWA({ toast } = {}) {
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; changed(); });
  addEventListener('appinstalled', () => { deferred = null; document.querySelector('.inst-banner')?.remove(); changed(); toast?.('✓ Installed. Open On the Scope from your Home Screen'); });
  // show the banner from the 2nd visit, after the user has had a look around
  const visits = +localStorage.getItem('ts:visits') + 1; localStorage.setItem('ts:visits', visits);
  if (visits >= 2 && !isStandalone()) setTimeout(() => banner(toast), 12000);
  // offline / online: prices pause; nothing stale is shown as live
  addEventListener('offline', () => toast?.("You're offline: live prices paused", 'var(--y)'));
  addEventListener('online', () => toast?.('Back online ✓'));
}
