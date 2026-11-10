// Launch chrome: official CA injection, robots, sitemap, share meta, favicon.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const site = require('../lib/site');

const BONK = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('siteCa accepts a Solana mint and rejects junk', () => {
  assert.equal(site.siteCa({}), '');
  assert.equal(site.siteCa({ SITE_CA: '' }), '');
  assert.equal(site.siteCa({ SITE_CA: '  ' + BONK + '  ' }), BONK);
  assert.equal(site.siteCa({ SITE_CA: 'soon' }), '');
  assert.equal(site.siteCa({ SITE_CA: 'not a mint' }), '');
  assert.equal(site.siteCa({ SITE_CA: '0x' + 'a'.repeat(40) }), '');
});

test('injectIndex keeps the soon placeholder, then swaps in a real CA', () => {
  const soon = site.injectIndex(html, '');
  assert.match(soon, /CA: soon 🔭/);
  assert.doesNotMatch(soon, /data-ca=/);
  assert.match(soon, /https:\/\/x\.com\/OnTheScopeFun/);

  const live = site.injectIndex(html, BONK);
  assert.doesNotMatch(live, /CA: soon/);
  assert.match(live, /data-ca="DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"/);
  assert.match(live, /The official On the Scope token\./);
  assert.match(live, /<span class="ca-short">DezX…B263<\/span>/);
  assert.match(live, /https:\/\/x\.com\/OnTheScopeFun/);
});

test('index.html has absolute share tags, X links, disclaimer, and a favicon', () => {
  assert.match(html, /property="og:image" content="https:\/\/onthescope\.fun\/og-image\.png"/);
  assert.match(html, /property="og:image:width" content="1200"/);
  assert.match(html, /property="og:image:height" content="630"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /name="twitter:site" content="@OnTheScopeFun"/);
  assert.match(html, /name="twitter:image" content="https:\/\/onthescope\.fun\/og-image\.png"/);
  assert.match(html, /href="https:\/\/x\.com\/OnTheScopeFun"/);
  assert.match(html, /Scope Score and safety flags are heuristics, not financial advice/);
  assert.match(html, /rel="icon" href="\/favicon\.ico"/);
  const ico = fs.readFileSync(path.join(__dirname, '..', 'public', 'favicon.ico'));
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.ok(ico.readUInt16LE(4) >= 1);
});

test('robots.txt and sitemap.xml point at the canonical host and skip /admin', () => {
  const robots = site.robotsTxt('https://onthescope.fun');
  assert.match(robots, /Allow: \//);
  assert.match(robots, /Disallow: \/admin/);
  assert.match(robots, /Disallow: \/api\//);
  assert.match(robots, /Sitemap: https:\/\/onthescope\.fun\/sitemap\.xml/);
  const map = site.sitemapXml('https://onthescope.fun');
  for (const p of ['https://onthescope.fun/', 'https://onthescope.fun/callers', 'https://onthescope.fun/advertise', 'https://onthescope.fun/profile']) {
    assert.match(map, new RegExp(`<loc>${p.replace(/[/.]/g, '\\$&')}<\\/loc>`));
  }
  assert.doesNotMatch(map, /\/admin/);
});

test('live routes serve robots, sitemap, favicon and inject SITE_CA', async () => {
  const prev = process.env.SITE_CA;
  delete process.env.SITE_CA;
  const { app } = require('../server');
  const srv = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const robots = await fetch(base + '/robots.txt');
    assert.equal(robots.status, 200);
    assert.match(await robots.text(), /Sitemap: https:\/\/onthescope\.fun\/sitemap\.xml/);

    const map = await fetch(base + '/sitemap.xml');
    assert.equal(map.status, 200);
    assert.match(map.headers.get('content-type'), /xml/);
    assert.match(await map.text(), /onthescope\.fun\/callers/);

    const ico = await fetch(base + '/favicon.ico');
    assert.equal(ico.status, 200);
    const buf = Buffer.from(await ico.arrayBuffer());
    assert.equal(buf.readUInt16LE(2), 1);

    let page = await fetch(base + '/');
    let body = await page.text();
    assert.equal(page.status, 200);
    assert.match(body, /CA: soon 🔭/);
    assert.match(body, /twitter:site/);

    process.env.SITE_CA = BONK;
    page = await fetch(base + '/advertise');
    body = await page.text();
    assert.match(body, new RegExp(`data-ca="${BONK}"`));
    assert.doesNotMatch(body, /CA: soon/);

    process.env.SITE_CA = 'soon';
    page = await fetch(base + '/profile');
    body = await page.text();
    assert.match(body, /CA: soon 🔭/);
  } finally {
    if (prev == null) delete process.env.SITE_CA;
    else process.env.SITE_CA = prev;
    await new Promise((res, rej) => srv.close(e => e ? rej(e) : res()));
  }
});
