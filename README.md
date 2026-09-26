# carstenb.github.io

Personal website of Carsten Bokemeyer — hand-written static HTML, no build step,
no generator, no runtime JavaScript.

| Page | File | Language |
|---|---|---|
| Start | `index.html` | en |
| CV | `cv/index.html` | en |
| Imprint & privacy | `impressum/index.html` | de |
| Not found | `404.html` | en |

## Layout

```
assets/site.css        All styling: tokens → shared shell → per-page blocks
assets/fonts/          Self-hosted woff2 + their OFL licences
assets/                Logo, portrait, company logos, favicons, OG image
design/og-card.html    Source template for assets/og-image.png — not deployed
site.webmanifest
```

## Conventions

- **Asset paths are root-absolute** (`/assets/…`). This is required, not cosmetic:
  GitHub Pages serves `404.html` for any missing path while the address bar keeps
  the requested URL, so relative paths would break on the error page.
- **URLs always carry a trailing slash** — `/`, `/cv/`, `/impressum/`. The same
  spelling is used in canonicals, Open Graph, the sitemap and internal links.
- **Fonts are self-hosted.** Nothing is loaded from Google or any other third
  party. The privacy text in the imprint says so — if that ever changes, the text
  has to change with it.
- **Page-specific CSS** is scoped by the `body` class: `page-start`, `page-cv`,
  `page-imprint`, `page-404`.
- Copy comes from the design handoff and is authored — don't paraphrase it.

## Regenerating the social preview

`assets/og-image.png` (1200×630) is exported from `design/og-card.html`:

```bash
./design/og-export.sh
```

It renders through headless Chrome so the real self-hosted webfonts are used.
Never re-typeset the card in an image editor — edit the template and re-run the
script, otherwise the image drifts from the site's typography.

The card's footer shows the address the site is actually served from. It is one
more thing to change when the custom domain lands — edit the template, re-run
the script, commit the new PNG.

## GitHub profile README

The profile at github.com/carstenb comes from the repo `carstenb/carstenb`,
which is build output only. Don't edit it there; the next sync overwrites it.

```bash
npm run profile
```

prints the README. `profile/build.js` takes identity from the JSON-LD, and the
claim, topics, Mandoria headline, companies and contact address from
`index.html`. It also sets the claim as an SVG header in the site's fonts and
colours. `profile/README.template.md` holds the structure and the copy that only
exists for GitHub. The rule: facts, identity, positioning and reusable content
come from the site; GitHub-specific wording stays in the template.

Extraction is strict. If a markup change leaves it without a claim, topic or
company, the `validate` workflow fails on the PR. After a merge that touches
any of its inputs, `sync-profile-readme.yml` builds the profile and mirrors it
into `carstenb/carstenb`.

The sync needs the Actions secret `PROFILE_REPO_TOKEN`: a fine-grained token
for `carstenb/carstenb` only, with Contents: Read and write. **It expires.** When
it does, the sync fails and the profile stays as it was until a new token is
stored.

## Manual upkeep

Not covered by any automation:

- The `© 2026` in the footer of all four pages.
- The imprint text (legal content).
- Renewing `PROFILE_REPO_TOKEN` before it expires.
- A later move to a custom domain: canonicals, Open Graph URLs, the sitemap, the
  JSON-LD `@id` and the Search Console property all change together.

## History

The previous Hugo site is preserved at the tag `old-site-2021`.
