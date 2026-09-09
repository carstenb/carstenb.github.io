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

`assets/og-image.png` (1200×630) is exported from `design/og-card.html`. Open that
file, edit the markup, and screenshot the `#og` element at 1×. Don't re-typeset it
in an image editor.

## Manual upkeep

Not covered by any automation:

- The `© 2026` in the footer of all four pages.
- The imprint text (legal content).
- A later move to a custom domain: canonicals, Open Graph URLs, the sitemap, the
  JSON-LD `@id` and the Search Console property all change together.

## History

The previous Hugo site is preserved at the tag `old-site-2021`.
