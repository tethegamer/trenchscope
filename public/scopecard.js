// Shareable Scope card: a 1200x675 PNG per token (Scope Score, safety flags, OG/VAMP, KOL buys), drawn client-side
// like the PnL card, plus a "Post on X" intent that tags @OnTheScope so the reply bot can answer with the live score.
const W = 1200, H = 675;
const rr = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
const tone = v => (v == null ? '#8b93a7' : v >= 70 ? '#14f195' : v >= 45 ? '#ffc94d' : '#ff4d6a');
const usdS = n => (n == null || !isFinite(n) ? '—' : n >= 1e9 ? '$' + (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? '$' + (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? '$' + (n / 1e3).toFixed(1) + 'K' : '$' + n.toFixed(0));
const clipT = (g, t, max) => { t = String(t || ''); while (t.length > 1 && g.measureText(t).width > max) t = t.slice(0, -2) + '…'; return t; };

/** facts: { symbol, name, mint, score:{total,grade,coin:{score,label},narrative:{score,label}}, safety, og, mcap, liq, kolBuys } */
export async function drawScopeCard(f) {
  try { await Promise.race([document.fonts.load('800 40px Inter'), new Promise(r => setTimeout(r, 1200))]); } catch {}
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  const sc = f.score || {}; const total = sc.total ?? null; const acc = tone(total);
  const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#07090d'); bg.addColorStop(1, '#0d1220'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const glow = (x, y, rad, c) => { const q = g.createRadialGradient(x, y, 0, x, y, rad); q.addColorStop(0, c); q.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = q; g.fillRect(0, 0, W, H); };
  glow(1050, -40, 620, 'rgba(153,69,255,.22)'); glow(250, 380, 420, acc + '22');
  g.strokeStyle = 'rgba(255,255,255,.035)'; g.lineWidth = 1;
  for (let x = 0; x < W; x += 48) { g.beginPath(); g.moveTo(x + .5, 0); g.lineTo(x + .5, H); g.stroke(); }
  for (let y = 0; y < H; y += 48) { g.beginPath(); g.moveTo(0, y + .5); g.lineTo(W, y + .5); g.stroke(); }
  g.textBaseline = 'middle';
  g.font = '800 34px Inter, system-ui, sans-serif'; g.fillStyle = '#fff'; g.fillText('On the ', 56, 70);
  g.fillStyle = '#84e639'; g.fillText('Scope', 56 + g.measureText('On the ').width, 70);
  g.font = '600 20px Inter, system-ui, sans-serif'; g.fillStyle = '#8b93a7'; g.textAlign = 'right'; g.fillText('SCOPE CARD · onthescope.fun', W - 56, 70); g.textAlign = 'left';
  // token
  g.font = '800 64px Inter, system-ui, sans-serif'; g.fillStyle = '#fff'; g.fillText(clipT(g, '$' + (f.symbol || '?'), 640), 56, 170);
  g.font = '500 26px Inter, system-ui, sans-serif'; g.fillStyle = '#8b93a7'; g.fillText(clipT(g, f.name || '', 640), 56, 222);
  g.font = '500 20px ui-monospace, monospace'; g.fillText(f.mint ? f.mint.slice(0, 6) + '…' + f.mint.slice(-6) : '', 56, 258);
  // score ring
  const cx = 300, cy = 440, R = 120;
  g.lineWidth = 22; g.strokeStyle = 'rgba(255,255,255,.08)'; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
  if (total != null) { g.strokeStyle = acc; g.lineCap = 'round'; g.beginPath(); g.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * total / 100); g.stroke(); }
  g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = '800 84px Inter, system-ui, sans-serif'; g.fillText(total == null ? '—' : String(total), cx, cy - 6);
  g.font = '700 20px Inter, system-ui, sans-serif'; g.fillStyle = '#8b93a7'; g.fillText('SCOPE SCORE', cx, cy + 52); g.textAlign = 'left';
  // facts
  const s = f.safety || {}; const og = f.og || {};
  const rows = [
    ['Coin fairness', sc.coin ? `${sc.coin.score} · ${sc.coin.label}` : 'n/a', tone(sc.coin?.score)],
    ['Narrative', sc.narrative ? `${sc.narrative.score} · ${sc.narrative.label}` : 'n/a', tone(sc.narrative?.score)],
    ['Bundles / snipers', s.unavailable || s.bundled == null ? 'not scanned' : s.bundled ? 'Bundle cluster found' : 'No strong signal', s.bundled ? '#ff4d6a' : '#14f195'],
    ['Authorities', s.unavailable ? 'n/a' : `${s.mintAuth ? 'Mint ON' : 'Mint revoked'} · ${s.freezeAuth ? 'Freeze ON' : 'Freeze revoked'}`, s.mintAuth || s.freezeAuth ? '#ff4d6a' : '#14f195'],
    ['OG / copycat', og.status === 'og' ? 'OG 👑' : og.status === 'vamp' ? (og.vv ? 'Valid Vamp' : 'VAMP (copycat)') : 'Unique', og.status === 'vamp' && !og.vv ? '#ff4d6a' : '#14f195'],
    ['KOL buys (24h)', f.kolBuys == null ? '—' : String(f.kolBuys), f.kolBuys ? '#84e639' : '#8b93a7'],
    ['MCap · Liquidity', `${usdS(f.mcap)} · ${usdS(f.liq)}`, '#e6e8ee'],
  ];
  const x0 = 560, y0 = 300, rh = 50;
  rr(g, x0 - 24, y0 - 40, W - x0 - 32, rows.length * rh + 30, 18); g.fillStyle = 'rgba(255,255,255,.04)'; g.fill();
  rows.forEach(([k, v, c], i) => {
    const y = y0 + i * rh;
    g.font = '600 22px Inter, system-ui, sans-serif'; g.fillStyle = '#8b93a7'; g.fillText(k, x0, y);
    g.font = '700 24px Inter, system-ui, sans-serif'; g.fillStyle = c; g.textAlign = 'right'; g.fillText(clipT(g, v, 330), W - 80, y); g.textAlign = 'left';
  });
  g.font = '500 16px Inter, system-ui, sans-serif'; g.fillStyle = '#5d6478';
  g.fillText('Automated estimate from public on-chain data. Not financial advice — DYOR.', 56, H - 34);
  return cv;
}

export async function openScopeCard({ mint, symbol, name, safety, og, mcap, liq }) {
  const [score, smart] = await Promise.all([
    fetch(`/api/score/solana/${mint}`).then(r => (r.ok ? r.json() : null)).catch(() => null),
    fetch(`/api/smart/${mint}`).then(r => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  const kolBuys = smart ? new Set((smart.buyers || []).map(b => b.addr || b.wallet || b)).size : null;
  const cv = await drawScopeCard({ mint, symbol, name, score, safety, og, mcap, liq, kolBuys });
  const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
  const url = URL.createObjectURL(blob);
  const page = `${location.origin}/token/${mint}`;
  const text = `$${symbol || ''} Scope Score ${score?.total ?? '?'}/100 on @OnTheScope${og?.status === 'og' ? ' 👑 OG' : og?.status === 'vamp' && !og.vv ? ' ⚠️ copycat' : ''}`;
  const wrap = document.createElement('div'); wrap.className = 'modal-bg'; wrap.id = 'scModal';
  wrap.innerHTML = `<div class="modal" style="max-width:760px"><button class="x" id="scX" aria-label="Close">✕</button><h3 style="margin:0 0 10px">📸 Scope card</h3>
    <img src="${url}" alt="Scope card" style="width:100%;border-radius:12px;display:block">
    <div class="actions" style="margin-top:12px"><a class="btn pri" download="scope-${(symbol || mint).replace(/[^\w-]/g, '')}.png" href="${url}">⬇ Download PNG</a>
    <a class="btn" target="_blank" rel="noopener" href="https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(page)}">Post on X ↗</a>
    ${navigator.canShare && navigator.canShare({ files: [new File([blob], 'scope.png', { type: 'image/png' })] }) ? '<button class="btn" id="scShare">Share…</button>' : ''}</div>
    <p class="dim" style="font-size:12px;margin:8px 0 0">Attach the PNG to your post. Tag @OnTheScope with any CA to get its live Scope Score back.</p></div>`;
  document.body.appendChild(wrap);
  const close = () => { wrap.remove(); URL.revokeObjectURL(url); };
  wrap.onclick = e => { if (e.target === wrap) close(); };
  wrap.querySelector('#scX').onclick = close;
  const sh = wrap.querySelector('#scShare'); if (sh) sh.onclick = () => navigator.share({ files: [new File([blob], 'scope.png', { type: 'image/png' })], text, url: page }).catch(() => {});
}
