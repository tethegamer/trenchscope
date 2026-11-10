// Launch-facing site chrome: official token CA, robots, sitemap.
const X_URL = 'https://x.com/OnTheScopeFun';
const X_HANDLE = '@OnTheScopeFun';
const SITE_CA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const CA_BAR_RE = /(<div id="ca-bar"[^>]*>)([\s\S]*?)(<\/div>)/;

function siteCa(env = process.env) {
  const v = String(env.SITE_CA || '').trim();
  return SITE_CA_RE.test(v) ? v : '';
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function shortCa(ca) {
  return ca.slice(0, 4) + '…' + ca.slice(-4);
}

function followHtml() {
  return `Follow <a href="${X_URL}" target="_blank" rel="noopener">${X_HANDLE}</a>`;
}

function caBarInnerHtml(ca) {
  if (!ca) return `CA: soon 🔭 · The official On the Scope token is coming. ${followHtml()}`;
  const safe = escapeHtml(ca);
  const short = escapeHtml(shortCa(ca));
  return `CA: <button type="button" class="ca-copy" data-ca="${safe}" title="Copy contract address" aria-label="Copy contract address ${safe}"><span class="ca-full">${safe}</span><span class="ca-short">${short}</span> <span aria-hidden="true">📋</span></button> · The official On the Scope token. ${followHtml()}`;
}

function injectIndex(html, ca) {
  return String(html).replace(CA_BAR_RE, (_, open, _inner, close) => open + caBarInnerHtml(ca) + close);
}

function publicBase(env = process.env) {
  return String(env.PUBLIC_URL || env.RENDER_EXTERNAL_URL || 'https://onthescope.fun').replace(/\/+$/, '');
}

function robotsTxt(base) {
  const b = String(base || 'https://onthescope.fun').replace(/\/+$/, '');
  return ['User-agent: *', 'Allow: /', 'Disallow: /admin', 'Disallow: /api/', `Sitemap: ${b}/sitemap.xml`, ''].join('\n');
}

function sitemapXml(base) {
  const b = String(base || 'https://onthescope.fun').replace(/\/+$/, '');
  const urls = [
    { loc: `${b}/`, changefreq: 'hourly', priority: '1.0' },
    { loc: `${b}/callers`, changefreq: 'hourly', priority: '0.7' },
    { loc: `${b}/advertise`, changefreq: 'weekly', priority: '0.6' },
    { loc: `${b}/profile`, changefreq: 'weekly', priority: '0.4' },
  ];
  const body = urls.map(u => `  <url>\n    <loc>${u.loc}</loc>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

module.exports = { siteCa, SITE_CA_RE, caBarInnerHtml, injectIndex, publicBase, robotsTxt, sitemapXml, X_URL, X_HANDLE };
