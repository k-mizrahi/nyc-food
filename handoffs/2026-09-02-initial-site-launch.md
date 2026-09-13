# Handoff — 2026-09-02: NYC food recs site built, deployed, analytics live

## Where things stand

- Site is live and returning 200: https://k-mizrahi.github.io/nyc-food/ (GitHub Pages, `main` branch of https://github.com/k-mizrahi/nyc-food, legacy build, auto-deploys in ~30s).
- Single file `index.html`: bilingual EN/HE (mirrored `#content-en` / `#content-he` blocks, RTL Hebrew), language toggle with localStorage persistence + `he` locale auto-detect, light/dark via `prefers-color-scheme`, zero dependencies.
- Five Google Maps list cards: big food map, pizza, coffee, Jackson Heights food crawl, Flushing food crawl. Link↔card mapping confirmed correct by owner after one swap fix (pizza = `CFVNGoLc5T8CCboP9`, coffee = `ZKH5m3iaLfmGKCSu6`).
- GoatCounter analytics live, site code `kobim`, dashboard https://kobim.goatcounter.com. Events: `map-food`, `map-pizza`, `map-coffee`, `crawl-jackson-heights`, `crawl-flushing`, `email-click`, `lang-en`, `lang-he`.
- Contact email on page: `mizrahi.kobi+nycfoodrecs@gmail.com` (plus-addressed for Gmail filtering).
- Working tree clean, local == origin/main at `f3684a6` (verified 2026-09-02).

## What changed this session

- `index.html` — created from scratch; then iterated: real map links, two crawl cards, email link (later plus-addressed), GoatCounter script + click tracking, friends-tour note card at bottom of both languages, "love"→"like" wording fix.
- `CLAUDE.md` — created; documents pull-rebase-first workflow, EN/HE mirroring rule, analytics event names, link-mapping gotcha.
- Repo created (`gh repo create nyc-food --public`), Pages enabled via API on `main`/`/`.

## Findings worth remembering

- Owner edits `index.html` directly in the GitHub web editor mid-session; one rebase conflict already happened (commit `fafc8ad` was theirs). Always `git pull --rebase` before any local edit; on conflict, owner's wording wins, re-apply `data-track` attributes on top.
- The maps.app.goo.gl short links are opaque: curl resolves them to google.com/maps URLs with no readable list name, and titles aren't in the static HTML. Which-list-is-which cannot be verified programmatically — confirm with the owner (this is exactly how the pizza/coffee swap happened).
- Claude-in-Chrome does not work in the owner's environment ("never works for me") — don't reach for it.
- GitHub Pages has no built-in analytics; repo Insights→Traffic counts repo visits only. GoatCounter chosen deliberately (free, cookie-less, no consent banner).
- Owner's GitHub username is `k-mizrahi` (not the email prefix).

## Next steps, in order

1. Photos section: owner will export food photos from Apple Photos into an `images/` folder; then build a small gallery (both language blocks). Blocked on owner providing photos.
2. Suggest owner enable "ignore my visits" in GoatCounter settings so self-checks don't inflate counts.
3. Possible later: custom domain, QR code for the link, Gmail filter `to:(mizrahi.kobi+nycfoodrecs@gmail.com)`.
4. Optional: owner has `~/.codex/config.toml`; `/import` offer made, not yet acted on.

## Operational cautions

- Never push without pulling first — the remote moves while sessions run.
- Every content edit goes in BOTH language blocks; Hebrew phrased naturally, not machine-literal.
- Don't rename existing GoatCounter event names (breaks history).
- Don't guess map-link ordering from message order again; confirm each URL's list with the owner.
- This page is public; no personal data beyond what the owner already chose to publish.
