#!/usr/bin/env node
// Site-specific invariants. Generic tools (html-validate, linkinator, Lighthouse,
// axe) cover the rest; these are the rules that are particular to this site and
// would otherwise silently rot.
//
//   node design/check.js [rootDir]

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.argv[2] || '.');
const ORIGIN = 'https://carstenb.github.io';

// Deployed pages and what we expect of them.
const PAGES = [
  { file: 'index.html', url: '/', indexable: true, lang: 'en' },
  { file: 'cv/index.html', url: '/cv/', indexable: true, lang: 'en' },
  { file: 'impressum/index.html', url: '/impressum/', indexable: false, lang: 'de' },
  { file: '404.html', url: null, indexable: false, lang: 'en' },
];

const SITEMAP_URLS = [`${ORIGIN}/`, `${ORIGIN}/cv/`];

// Byte budgets. og-image is fetched only by scrapers, so it gets its own.
const BUDGET = { html: 60_000, css: 40_000, font: 60_000, image: 120_000, ogImage: 400_000, total: 2_500_000 };

const problems = [];
const fail = (m) => problems.push(m);
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// --- pages -----------------------------------------------------------------

for (const page of PAGES) {
  const src = read(page.file);
  const at = (m) => `${page.file}: ${m}`;

  const lang = src.match(/<html[^>]*\slang="([^"]+)"/)?.[1];
  if (lang !== page.lang) fail(at(`lang is "${lang}", expected "${page.lang}"`));

  // robots
  const robots = src.match(/<meta\s+name="robots"\s+content="([^"]+)"/i)?.[1];
  if (page.indexable && robots && /noindex/i.test(robots)) {
    fail(at(`must be indexable but carries robots="${robots}"`));
  }
  if (!page.indexable && !/noindex/i.test(robots || '')) {
    fail(at('must carry a noindex robots meta'));
  }

  // canonical + og:url
  const canonical = src.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i)?.[1];
  const ogUrl = src.match(/<meta\s+property="og:url"\s+content="([^"]+)"/i)?.[1];
  if (page.url) {
    const want = ORIGIN + page.url;
    if (canonical !== want) fail(at(`canonical is "${canonical}", expected "${want}"`));
    if (ogUrl !== want) fail(at(`og:url is "${ogUrl}", expected "${want}"`));
  }

  // every absolute og/twitter URL must be https and on our origin
  for (const [, prop, value] of src.matchAll(/<meta\s+property="(og:(?:url|image))"\s+content="([^"]+)"/gi)) {
    if (!value.startsWith('https://')) fail(at(`${prop} is not https: ${value}`));
    if (!value.startsWith(ORIGIN)) fail(at(`${prop} points off-origin: ${value}`));
  }

  // structure / a11y basics that generic linters do not assert for us
  if ((src.match(/<h1[\s>]/g) || []).length !== 1) fail(at('needs exactly one <h1>'));
  if (!src.includes('id="main-content"')) fail(at('missing #main-content landmark'));
  if (!/<a class="skip"/.test(src)) fail(at('missing skip link'));
  if (!/<nav\s/.test(src)) fail(at('nav is not a <nav> element'));

  // no third-party font loading, no leftovers from the design reference
  for (const needle of ['fonts.googleapis.com', 'fonts.gstatic.com', 'image-slot', 'carbo-logo.jpg', 'mix-blend-mode']) {
    if (src.includes(needle)) fail(at(`must not reference "${needle}"`));
  }

  // relative asset or page paths break the 404 page, which is served from any path
  if (/(?:src|href)="(?!\/|https?:|mailto:|#)/.test(src)) {
    fail(at('has a relative src/href — all paths must be root-absolute'));
  }

  // referenced local files must exist
  for (const [, ref] of src.matchAll(/(?:src|href)="(\/[^"]+)"/g)) {
    if (!fs.existsSync(path.join(ROOT, ref))) fail(at(`references missing file ${ref}`));
  }
  for (const [, set] of src.matchAll(/srcset="([^"]+)"/g)) {
    for (const part of set.split(',')) {
      const ref = part.trim().split(/\s+/)[0];
      if (ref.startsWith('/') && !fs.existsSync(path.join(ROOT, ref))) fail(at(`srcset references missing file ${ref}`));
    }
  }
}

// --- manifest --------------------------------------------------------------

try {
  const mf = JSON.parse(read('site.webmanifest'));
  if (mf.start_url !== '/') fail(`manifest: start_url is "${mf.start_url}", expected "/"`);
  if (mf.scope !== '/') fail(`manifest: scope is "${mf.scope}", expected "/"`);
  if (!Array.isArray(mf.icons) || mf.icons.length === 0) fail('manifest: no icons');
  for (const icon of mf.icons || []) {
    if (!icon.sizes || !icon.type) fail(`manifest: icon ${icon.src} lacks sizes/type`);
    if (!fs.existsSync(path.join(ROOT, icon.src))) fail(`manifest: icon ${icon.src} does not exist`);
  }
  if (!(mf.icons || []).some((i) => i.purpose === 'maskable')) fail('manifest: no maskable icon');
} catch (e) {
  fail(`manifest: ${e.message}`);
}

// --- sitemap & robots ------------------------------------------------------

const sitemap = read('sitemap.xml');
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
for (const loc of locs) {
  if (!loc.startsWith('https://')) fail(`sitemap: ${loc} is not absolute https`);
  if (!loc.endsWith('/')) fail(`sitemap: ${loc} lacks the trailing slash`);
}
for (const banned of ['404', 'impressum']) {
  if (locs.some((l) => l.includes(banned))) fail(`sitemap: must not list ${banned}`);
}
const missing = SITEMAP_URLS.filter((u) => !locs.includes(u));
const extra = locs.filter((u) => !SITEMAP_URLS.includes(u));
if (missing.length) fail(`sitemap: missing ${missing.join(', ')}`);
if (extra.length) fail(`sitemap: unexpected ${extra.join(', ')}`);

if (!read('robots.txt').includes(`Sitemap: ${ORIGIN}/sitemap.xml`)) {
  fail('robots.txt: does not point at the sitemap');
}

// --- byte budgets ----------------------------------------------------------

let total = 0;
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full);
    if (entry.isDirectory()) {
      // Dot-directories are tooling, never deployed content — .git, .github,
      // .claude, and local artefacts like .lighthouseci, which would otherwise
      // blow the byte budget with 800 KB report files.
      if (entry.name.startsWith('.') || ['design', 'node_modules'].includes(entry.name)) continue;
      walk(full);
      continue;
    }
    const size = fs.statSync(full).size;
    total += size;
    const ext = path.extname(entry.name);
    const cap =
      entry.name === 'og-image.png' ? BUDGET.ogImage
      : ext === '.html' ? BUDGET.html
      : ext === '.css' ? BUDGET.css
      : ext === '.woff2' ? BUDGET.font
      : ['.png', '.jpg', '.webp', '.svg'].includes(ext) ? BUDGET.image
      : null;
    if (cap && size > cap) fail(`budget: ${rel} is ${size} bytes, cap is ${cap}`);
  }
};
walk(ROOT);
if (total > BUDGET.total) fail(`budget: deployed total is ${total} bytes, cap is ${BUDGET.total}`);

// --- report ----------------------------------------------------------------

if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n`);
  for (const p of problems) console.error('  ✗ ' + p);
  console.error('');
  process.exit(1);
}
console.log(`✓ all site checks passed (${Math.round(total / 1024)} KB deployed)`);
