# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page bilingual (English/Hebrew) site with Kobi's NYC food recommendations — links to five shared Google Maps lists plus contact info. Hosted on GitHub Pages at https://k-mizrahi.github.io/nyc-food/ from the `main` branch of https://github.com/k-mizrahi/nyc-food. No build step, no dependencies, no framework — just `index.html`.

## Workflow

- **Always `git pull --rebase` before editing.** The owner edits text directly in the GitHub web editor, so the remote frequently moves. Concurrent edits have already caused one merge conflict. When resolving conflicts, the owner's wording wins; re-apply structural attributes (e.g. `data-track`) on top.
- Pushing to `main` deploys automatically (~30s). Verify with `curl -s https://k-mizrahi.github.io/nyc-food/ | grep <something-new>`.
- Preview locally: `open index.html`.

## Structure of index.html

- Two mirrored content blocks: `#content-en` and `#content-he` (the Hebrew one has `dir="rtl"` and `lang="he"`). **Every content change must be made in both**, with matching wording. The Hebrew is not a literal machine translation — keep it natural.
- Language toggle persists via `localStorage` and auto-selects Hebrew for `he` browser locales.
- Cards are `<div class="card">` blocks; theming via CSS custom properties with a `prefers-color-scheme: dark` override.

## Analytics (GoatCounter, site code `kobim`)

- Dashboard: https://kobim.goatcounter.com. Script tag at the bottom of `<body>`.
- Click events use `data-track="<name>"` attributes wired by a delegated listener; language-toggle clicks are tracked separately as `lang-en`/`lang-he`.
- Existing event names: `map-food`, `map-pizza`, `map-coffee`, `crawl-jackson-heights`, `crawl-flushing`, `email-click`. New trackable links just need a `data-track` attribute (on both language copies). Don't rename existing events — it breaks history continuity.

## Facts that are easy to get wrong

- The Google Maps short links are opaque (no titles resolvable via curl); the pizza/coffee pair was once swapped. If links change, have the owner confirm which list each URL is.
- Contact email on the page is the plus-addressed `mizrahi.kobi+nycfoodrecs@gmail.com` (for Gmail filtering) — keep the plus tag when touching mailto links.

## Planned / discussed but not built

- Photos section (owner will export from Apple Photos into an `images/` folder when ready).
- Possibly a custom domain later.
