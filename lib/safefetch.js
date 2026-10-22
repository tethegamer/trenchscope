// Fetch an untrusted, user-supplied URL (token websites) safely: http(s) only, public IPs only
// (checked at connect time, so DNS rebinding can't reach private hosts), max 3 redirects, size + time capped.
const http = require('http'), https = require('https'), dns = require('dns'), net = require('net');

function privateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const s = ip.toLowerCase();
  if (s.startsWith('::ffff:')) return privateIp(s.slice(7));
  return s === '::1' || s === '::' || s.startsWith('fc') || s.startsWith('fd') || s.startsWith('fe80');
}
function lookup(host, opts, cb) {
  if (typeof opts === 'function') { cb = opts; opts = {}; }
  dns.lookup(host, { family: opts.family || 0, all: true }, (err, list) => {
    if (err) return cb(err);
    const okList = (list || []).filter(a => !privateIp(a.address));
    if (!okList.length || okList.length !== list.length) return cb(new Error('blocked private address'));
    if (opts.all) return cb(null, okList);
    cb(null, okList[0].address, okList[0].family);
  });
}
function once(url, { timeout, maxBytes, headers }) {
  return new Promise((resolve, reject) => {
    let u; try { u = new URL(url); } catch { return reject(new Error('bad url')); }
    if (!/^https?:$/.test(u.protocol)) return reject(new Error('only http(s)'));
    if (u.port && !['80', '443'].includes(u.port)) return reject(new Error('port not allowed'));
    if (net.isIP(u.hostname) && privateIp(u.hostname)) return reject(new Error('blocked private address'));
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.get(u, { lookup, timeout, headers: { 'user-agent': 'Mozilla/5.0 (compatible; OnTheScopeBot/1.0; +https://github.com/tethegamer/trenchscope)', accept: 'text/html,*/*', ...headers } }, res => {
      const chunks = []; let size = 0;
      res.on('data', c => { size += c.length; if (size > maxBytes) { res.destroy(); } else chunks.push(c); });
      res.on('close', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8'), url: u.href }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}
async function safeFetch(url, { timeout = 6000, maxBytes = 400e3, redirects = 3, headers } = {}) {
  let cur = url;
  for (let i = 0; i <= redirects; i++) {
    const r = await once(cur, { timeout, maxBytes, headers });
    if (r.status >= 300 && r.status < 400 && r.headers.location) { cur = new URL(r.headers.location, cur).href; continue; }
    return r;
  }
  throw new Error('too many redirects');
}
module.exports = { safeFetch, privateIp };
