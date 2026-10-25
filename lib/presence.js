// Real-time site-wide online presence & per-token chart viewer tracking.
//  * Each browser tab holds a session ID (`sid`) and connects to GET /api/stream (SSE)
//    plus sends instant updates via POST/GET /api/presence when opening/closing a token chart.
//  * SSE disconnect cleans up the session immediately; non-SSE heartbeat sessions expire after TTL_MS (45s).
"use strict";
const crypto = require('crypto');

const SID_RE = /^[A-Za-z0-9_-]{4,80}$/;
const CHAIN_RE = /^[a-z0-9_-]{2,24}$/i;
const ADDR_RE = /^[A-Za-z0-9:._-]{2,160}$/;

function normalizeToken(token, chain) {
  if (!token || typeof token !== 'string') return null;
  const raw = token.trim().slice(0, 180);
  if (!raw) return null;
  let ch = chain && typeof chain === 'string' ? chain.trim().toLowerCase() : 'solana';
  let addr = raw;
  const idx = raw.indexOf(':');
  if (idx > 0) {
    const pfx = raw.slice(0, idx).toLowerCase();
    const rest = raw.slice(idx + 1).trim();
    if (CHAIN_RE.test(pfx) && rest) {
      ch = pfx;
      addr = rest;
    }
  }
  if (!ADDR_RE.test(addr)) return null;
  if (/^0x[a-fA-F0-9]+$/.test(addr)) addr = addr.toLowerCase();
  if (!ch || ch === 'solana' || ch === 'all') return addr;
  if (!CHAIN_RE.test(ch)) return null;
  return `${ch}:${addr}`;
}

function createPresence({ ttlMs = 45000, debounceMs = 50, pingMs = 20000, now = () => Date.now() } = {}) {
  const sessions = new Map(); // sid -> { sid, token, lastSeen, sse: Set<res> }
  const streams = new Set();  // all active SSE res objects
  let bcastTimer = null;
  let lastBcastAt = 0;
  let lastPayload = '';

  function prune(ts = now()) {
    let removed = false;
    for (const [sid, s] of sessions) {
      if (s.sse.size === 0 && ts - s.lastSeen > ttlMs) {
        sessions.delete(sid);
        removed = true;
      }
    }
    return removed;
  }

  function snapshot(ts = now()) {
    prune(ts);
    const watching = {};
    let watchingTotal = 0;
    for (const s of sessions.values()) {
      if (s.token) {
        watching[s.token] = (watching[s.token] || 0) + 1;
        watchingTotal++;
      }
    }
    return { online: sessions.size, watchingTotal, watching, ts };
  }

  function count(token, chain) {
    const k = normalizeToken(token, chain);
    if (!k) return 0;
    prune();
    let n = 0;
    for (const s of sessions.values()) if (s.token === k) n++;
    return n;
  }

  function summary() {
    const snap = snapshot();
    return {
      online: snap.online,
      watchingTotal: snap.watchingTotal,
      tokensWatched: Object.keys(snap.watching).length,
      sseClients: streams.size,
    };
  }

  function sendSse(res, event, data) {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      res.flush?.();
    } catch {}
  }

  function broadcastNow() {
    if (bcastTimer) { clearTimeout(bcastTimer); bcastTimer = null; }
    const ts = now();
    const snap = snapshot(ts);
    lastPayload = JSON.stringify({ online: snap.online, watching: snap.watching });
    lastBcastAt = ts;
    for (const res of streams) sendSse(res, 'presence', snap);
    return snap;
  }

  function scheduleBroadcast(force = false) {
    const ts = now();
    const snap = snapshot(ts);
    const key = JSON.stringify({ online: snap.online, watching: snap.watching });
    if (!force && key === lastPayload) return snap;
    if (debounceMs <= 0 || ts - lastBcastAt >= debounceMs) {
      return broadcastNow();
    }
    if (!bcastTimer) {
      const wait = Math.max(1, debounceMs - (ts - lastBcastAt));
      bcastTimer = setTimeout(() => { bcastTimer = null; broadcastNow(); }, wait);
      bcastTimer.unref?.();
    }
    return snap;
  }

  function ensureSession(sid, ts = now()) {
    let s = sessions.get(sid);
    if (!s) {
      s = { sid, token: null, lastSeen: ts, sse: new Set() };
      sessions.set(sid, s);
    } else {
      s.lastSeen = ts;
    }
    return s;
  }

  function touch(sid, { token, chain } = {}) {
    const cleanSid = typeof sid === 'string' ? sid.trim() : '';
    if (!SID_RE.test(cleanSid)) return snapshot();
    const ts = now();
    const existed = sessions.has(cleanSid);
    const s = ensureSession(cleanSid, ts);
    let changed = !existed;
    if (token !== undefined) {
      const nextTok = normalizeToken(token, chain);
      if (s.token !== nextTok) {
        s.token = nextTok;
        changed = true;
      }
    }
    return changed ? scheduleBroadcast(true) : snapshot(ts);
  }

  function leave(sid) {
    const cleanSid = typeof sid === 'string' ? sid.trim() : '';
    if (!SID_RE.test(cleanSid)) return snapshot();
    const s = sessions.get(cleanSid);
    if (!s) return snapshot();
    for (const res of s.sse) streams.delete(res);
    s.sse.clear();
    sessions.delete(cleanSid);
    return scheduleBroadcast(true);
  }

  function connectStream(req, res, { sid, token, chain } = {}) {
    const cleanSid = typeof sid === 'string' && SID_RE.test(sid.trim())
      ? sid.trim()
      : 's_' + crypto.randomBytes(8).toString('hex');
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();

    const s = ensureSession(cleanSid, now());
    if (token !== undefined) s.token = normalizeToken(token, chain);
    s.sse.add(res);
    const snap = scheduleBroadcast(true);
    streams.add(res);
    sendSse(res, 'presence', { ...snap, sid: cleanSid });

    const hb = setInterval(() => {
      s.lastSeen = now();
      if (prune(s.lastSeen)) scheduleBroadcast(true);
      sendSse(res, 'ping', { ts: s.lastSeen, online: sessions.size });
    }, pingMs);
    hb.unref?.();

    req.on('close', () => {
      clearInterval(hb);
      streams.delete(res);
      const cur = sessions.get(cleanSid);
      if (cur) {
        cur.sse.delete(res);
        if (cur.sse.size === 0) {
          sessions.delete(cleanSid);
          scheduleBroadcast(true);
        }
      }
    });
  }

  const sweepTimer = setInterval(() => {
    if (prune()) scheduleBroadcast(true);
  }, Math.min(15000, Math.max(2000, Math.floor(ttlMs / 3))));
  sweepTimer.unref?.();

  return {
    touch,
    leave,
    snapshot,
    count,
    summary,
    connectStream,
    prune,
    broadcastNow,
    stop() {
      clearInterval(sweepTimer);
      if (bcastTimer) clearTimeout(bcastTimer);
    },
  };
}

module.exports = { createPresence, normalizeToken, SID_RE };
