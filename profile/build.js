#!/usr/bin/env node
// Generates the GitHub profile README (carstenb/carstenb) from the site.
//
// Facts, identity, positioning and reusable content come from index.html and
// assets/. Copy that only exists to make the profile work on GitHub lives in
// profile/README.template.md. A markup change that breaks extraction fails
// here, on the PR, never on the live profile.
//
//   node profile/build.js                  print the README to stdout
//   node profile/build.js --out <dir>      write README.md + assets/ to <dir>
//   node profile/build.js --root <dir>     read the site from <dir> (default: repo root)

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const ROOT = path.resolve(opt('root', path.join(__dirname, '..')));
const OUT = opt('out', null);

const problems = [];
const fail = (m) => problems.push(m);
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// --- html helpers ------------------------------------------------------------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);

// Inline HTML to Markdown: the few tags the site uses in copy, everything else dropped.
const inline = (html) =>
  decode(
    html
      .replace(/<\/?em>/g, '*')
      .replace(/<\/?b>/g, '**')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\s+/g, ' ')
    .trim();

// Every match of re in src. `what` names the field in error messages.
const all = (src, re, what) => {
  const found = [...src.matchAll(re)];
  if (!found.length) fail(`${what}: not found`);
  return found;
};

// Exactly one match of re in src, or a failure naming the field.
const one = (src, re, what) => {
  const found = [...src.matchAll(re)];
  if (found.length !== 1) {
    fail(`${what}: expected exactly one, found ${found.length}`);
    return null;
  }
  return found[0];
};

const need = (value, what) => {
  if (typeof value !== 'string' || !value.trim()) {
    fail(`${what}: missing or empty`);
    return '';
  }
  return value.trim();
};

// --- extract -----------------------------------------------------------------

const html = read('index.html');
const section = (id) =>
  one(html, new RegExp(`<section[^>]*\\sid="${id}"[^>]*>([\\s\\S]*?)</section>`, 'g'), `section #${id}`)?.[1] ?? '';

// Identity: JSON-LD first.
let person = {};
const ld = one(html, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, 'JSON-LD block');
if (ld) {
  try {
    person = JSON.parse(ld[1]).mainEntity || {};
    if (person['@type'] !== 'Person') fail('JSON-LD: mainEntity is not a Person');
  } catch (e) {
    fail(`JSON-LD: ${e.message}`);
  }
}
const name = need(person.name, 'JSON-LD name');
const jobTitle = need(person.jobTitle, 'JSON-LD jobTitle');
const employer = need(person.worksFor?.name, 'JSON-LD worksFor.name');
const site = need(person.url, 'JSON-LD url');
const linkedin = need((person.sameAs || []).find((u) => u.includes('linkedin.com')), 'JSON-LD sameAs LinkedIn');

// Positioning: the claim in the hero.
const hero = one(html, /<header class="hero">([\s\S]*?)<\/header>/g, '.hero')?.[1] ?? '';
const h1 = one(hero, /<h1>([\s\S]*?)<\/h1>/g, '.hero h1')?.[1] ?? '';
const claim = need(inline(h1), '.hero h1 text');

// Topics: at least one, each with a name and a line.
const topics = all(section('work'), /<div class="topic">([\s\S]*?)<\/div>/g, '.topic').map((m, i) => ({
  number: String(i + 1).padStart(2, '0'),
  name: need(inline(m[1].match(/<span class="n">([\s\S]*?)<\/span>/)?.[1] ?? ''), `.topic ${i + 1} span.n`),
  line: need(inline(m[1].match(/<h3>([\s\S]*?)<\/h3>/)?.[1] ?? ''), `.topic ${i + 1} h3`),
}));

// Mandoria: its tag and headline from the side-projects section.
const side = section('side');
const projects = [...side.matchAll(/<span class="tag">([\s\S]*?)<\/span>\s*<h3>([\s\S]*?)<\/h3>/g)]
  .map((m) => ({ tag: inline(m[1]), line: inline(m[2]) }))
  .filter((p) => p.tag.startsWith('Building · Mandoria'));
if (projects.length !== 1) fail(`#side Mandoria tag: expected exactly one, found ${projects.length}`);
const mandoria = {
  name: need(projects[0]?.tag.split('·').pop(), '#side Mandoria name'),
  line: need(projects[0]?.line.replace(/\.$/, ''), '#side Mandoria h3'),
};

// Companies: alt text of every logo, in page order.
const logos = hero.split(/<div class="logos">/)[1] ?? '';
one(hero, /<div class="logos">/g, '.hero .logos');
const companies = all(logos,/<div class="cell">(<img[^>]*>)/g, '.logos .cell img').map((m, i) =>
  need(decode(m[1].match(/\salt="([^"]*)"/)?.[1] ?? ''), `.logos .cell img ${i + 1} alt`),
);
const joined = companies.length > 1 ? `${companies.slice(0, -1).join(', ')} and ${companies.at(-1)}` : companies[0] || '';

// Contact address, without the subject line the site adds.
const mailto = one(section('contact'), /href="(mailto:[^"?]+)[^"]*"/g, '#contact mailto')?.[1] ?? '';

// --- header svg --------------------------------------------------------------

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Blend a #rrggbb colour towards white; share 0..1.
function lighten(hex, share) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return '#' + c.map((v) => Math.round(v + (255 - v) * share).toString(16).padStart(2, '0')).join('');
}

// The site's h1 and the template's tagline set as an image, so GitHub shows the
// site's typography. SVGs shown through <img> may not load external fonts, but
// embedded data: fonts work, so the woff2 files travel inside the SVG.
function headerSvgs(tagline) {
  const css = read('assets/site.css');
  const root = one(css, /:root\{([^}]*)\}/g, 'site.css :root')?.[1] ?? '';
  const token = (t) => need(root.match(new RegExp(`--${t}:(#[0-9a-fA-F]{6})\\b`))?.[1], `site.css --${t}`);
  const light = { ink: token('ink'), ink2: token('ink-2'), accent: token('accent') };
  const dark = { ink: token('paper'), ink2: token('rule-2'), accent: lighten(light.accent, 0.35) };
  // The tagline sits on the signal yellow in both themes, always in dark ink.
  const marker = { fill: token('signal'), ink: light.ink };

  // The claim, split into plain and <em> runs, broken after its first comma.
  const ems = h1.match(/<em>/g) || [];
  if (ems.length !== 1) fail(`.hero h1: expected exactly one <em> for the header, found ${ems.length}`);
  const runs = h1
    .split(/(<em>[\s\S]*?<\/em>)/)
    .filter(Boolean)
    .map((part) => ({ em: part.startsWith('<em>'), text: decode(part.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ') }));
  const lines = [[], []];
  let broken = false;
  for (const run of runs) {
    const at = broken ? -1 : run.text.indexOf(',');
    if (at === -1) {
      lines[broken ? 1 : 0].push(run);
      continue;
    }
    lines[0].push({ ...run, text: run.text.slice(0, at + 1) });
    lines[1].push({ ...run, text: run.text.slice(at + 1).trimStart() });
    broken = true;
  }
  if (!broken) fail('.hero h1: the header breaks the claim after its first comma, but it has none; add a break rule');

  const logoSrc = read('assets/carbo-logo.svg').replace(/<metadata>[\s\S]*?<\/metadata>/, '');
  const viewBox = need(logoSrc.match(/<svg[^>]*\sviewBox="([^"]+)"/)?.[1], 'carbo-logo.svg viewBox');
  const logoBody = logoSrc.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  for (const fill of ['#1A1B1C', '#E0E0E0']) {
    if (!logoBody.includes(`fill="${fill}"`)) fail(`carbo-logo.svg: expected fill ${fill}`);
  }
  const [, , vbW, vbH] = viewBox.split(/\s+/).map(Number);

  const font = (file) => fs.readFileSync(path.join(ROOT, 'assets/fonts', file)).toString('base64');
  const fonts = [
    `@font-face{font-family:'Gabarito';src:url(data:font/woff2;base64,${font('gabarito-400.woff2')}) format('woff2')}`,
    `@font-face{font-family:'Caveat Brush';src:url(data:font/woff2;base64,${font('caveat-brush-400.woff2')}) format('woff2')}`,
    `@font-face{font-family:'Space Mono';src:url(data:font/woff2;base64,${font('space-mono-400.woff2')}) format('woff2')}`,
  ].join('\n');

  const W = 790;
  const H = 226;
  const logoH = 128;
  const logoW = Math.round((logoH * vbW) / vbH);
  const textX = logoW + 30;
  // Space Mono is monospaced (advance 0.612em), so the marker behind the
  // tagline can be sized exactly without measuring text.
  const tagSize = 15;
  const tagW = Math.ceil([...tagline].length * 0.612 * tagSize);

  const build = (c, logo) => {
    const tspans = (line) =>
      line
        .map((r) =>
          r.em
            ? `<tspan font-family="'Caveat Brush',cursive" font-size="46" fill="${c.accent}">${escapeXml(r.text)}</tspan>`
            : escapeXml(r.text),
        )
        .join('');
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeXml(`${name}: ${claimPlain} ${tagline}`)}">`,
      `<title>${escapeXml(`${name}: ${claimPlain} ${tagline}`)}</title>`,
      '<!-- Generated by profile/build.js from carstenb.github.io. Gabarito, Caveat Brush and Space Mono are embedded under the SIL Open Font License 1.1. -->',
      `<style>\n${fonts}\n</style>`,
      `<svg x="0" y="22" width="${logoW}" height="${logoH}" viewBox="${viewBox}">${logo}</svg>`,
      `<g font-family="'Gabarito',system-ui,sans-serif">`,
      `<text x="${textX}" y="44" font-size="22" fill="${c.ink2}">${escapeXml(name)}</text>`,
      `<text x="${textX}" y="100" font-size="42" letter-spacing="-0.8" fill="${c.ink}">${tspans(lines[0])}</text>`,
      `<text x="${textX}" y="150" font-size="42" letter-spacing="-0.8" fill="${c.ink}">${tspans(lines[1])}</text>`,
      '</g>',
      `<rect x="${textX - 10}" y="184" width="${tagW + 20}" height="30" rx="3" fill="${marker.fill}"/>`,
      `<text x="${textX}" y="204" font-family="'Space Mono',ui-monospace,monospace" font-size="${tagSize}" fill="${marker.ink}">${escapeXml(tagline)}</text>`,
      '</svg>',
      '',
    ].join('\n');
  };

  // Dark theme: the logo's ink and ground swap places.
  const swapped = logoBody
    .replace(/fill="#1A1B1C"/g, 'fill="@INK@"')
    .replace(/fill="#E0E0E0"/g, 'fill="#1A1B1C"')
    .replace(/fill="@INK@"/g, 'fill="#E0E0E0"');

  return { light: build(light, logoBody), dark: build(dark, swapped), lines };
}

// --- render ------------------------------------------------------------------

// The tagline is template copy but is set in the header image, so the template
// carries it as a directive comment that is removed from the output.
let template = read('profile/README.template.md');
const tagline = need(one(template, /<!-- tagline: (.*?) -->\n?/g, 'template tagline directive')?.[1], 'template tagline');
template = template.replace(/<!-- tagline: .*? -->\n?/, '');

const claimPlain = claim.replace(/\*/g, '');
const svgs = headerSvgs(tagline);
const alt = escapeXml(`${name}: ${claimPlain} ${tagline}`);

const header = [
  '<picture>',
  '  <source media="(prefers-color-scheme: dark)" srcset="assets/header-dark.svg">',
  `  <img src="assets/header-light.svg" alt="${alt}" width="100%">`,
  '</picture>',
].join('\n');

const values = {
  header,
  role: `${jobTitle} at ${employer}`,
  companies: joined,
  mandoria,
  links: { site, cv: `${site}cv/`, linkedin, email: mailto },
};

const lookup = (scope, key) => key.split('.').reduce((v, k) => (v == null ? v : v[k]), scope);

// {{path.to.value}} plus one loop form, {{#list}}…{{/list}}. Nothing else.
const render = (tpl, scope) =>
  tpl
    .replace(/\{\{#(\w+)\}\}\n?([\s\S]*?)\{\{\/\1\}\}\n?/g, (_, key, body) => {
      const list = lookup(scope, key);
      if (!Array.isArray(list) || !list.length) {
        fail(`template: list "${key}" is empty`);
        return '';
      }
      return list.map((item) => render(body, item)).join('');
    })
    .replace(/\{\{([\w.]+)\}\}/g, (m, key) => {
      const v = lookup(scope, key);
      if (typeof v !== 'string') {
        fail(`template: no value for {{${key}}}`);
        return m;
      }
      return v;
    });

const readme = render(template, { ...values, topics })
  .replace(/\n{3,}/g, '\n\n');

// --- output checks -----------------------------------------------------------

// House rules: no em dashes, nothing set in all caps. A line trips the caps
// check only with 8+ letters and no lowercase, so API or MCP never do.
const checkText = (text, where) => {
  if (text.includes('{{')) fail(`${where}: unfilled placeholder`);
  if (text.includes('—')) fail(`${where}: contains an em dash`);
  for (const line of text.split('\n')) {
    const letters = line
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\]\([^)]*\)/g, ']')
      .replace(/[^\p{L}]/gu, '');
    if (letters.length >= 8 && letters === letters.toUpperCase()) {
      fail(`${where}: all-caps line "${line.trim()}"`);
    }
  }
};
checkText(readme, 'README');

const files = { 'README.md': readme };
for (const line of svgs.lines) checkText(line.map((r) => r.text).join(''), 'header');
checkText(tagline, 'tagline');
files['assets/header-light.svg'] = svgs.light;
files['assets/header-dark.svg'] = svgs.dark;

// --- report / write ----------------------------------------------------------

if (problems.length) {
  console.error(`\nprofile: ${problems.length} problem(s):\n`);
  for (const p of problems) console.error('  ✗ ' + p);
  console.error('');
  process.exit(1);
}

if (!OUT) {
  process.stdout.write(readme);
  process.exit(0);
}

// Write into a fresh sibling directory, then swap it into place, so <out> is
// either the complete new output or untouched. No stale files survive.
const out = path.resolve(OUT);
const tmp = `${out}.tmp-${process.pid}`;
try {
  fs.rmSync(tmp, { recursive: true, force: true });
  for (const [rel, content] of Object.entries(files)) {
    const dest = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content);
  }
  fs.rmSync(out, { recursive: true, force: true });
  fs.renameSync(tmp, out);
} catch (e) {
  fs.rmSync(tmp, { recursive: true, force: true });
  console.error(`profile: could not write ${out}: ${e.message}`);
  process.exit(1);
}
console.log(`✓ profile written to ${path.relative(process.cwd(), out) || '.'}`);
