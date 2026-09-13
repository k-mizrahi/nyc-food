# Handoff — 2026-09-08: webapp direction decided, spec written, no code yet

## Where things stand

- Static site remains live and untouched: https://k-mizrahi.github.io/nyc-food/ serves from `main` at `f3684a6`. Nothing this session changed the deployed page.
- New branch `webapp` created off `main` (local only, not pushed). It holds the project's pivot: a real webapp with its own database of recommendations, replacing the Maps-links-only page eventually.
- Spec lives at `plans/webapp_2026-09-03.md` (untracked, not yet committed). It records the thesis, ratified decisions, stack, data-model sketch, and open questions.
- Core thesis (owner-agreed): Google Maps is a database of *places*; this app is a database of *recommendations*. Link to Google for facts (hours, photos, directions), own the opinions (dish-level tips, tags, crawls, bilingual notes). Never rebuild what Google does well.
- Zero implementation exists. No Supabase project, no frontend scaffold, no schema applied anywhere.

## What changed this session

- `plans/webapp_2026-09-03.md` — created; full spec with decisions table, differentiators, stack, Postgres schema sketch (places / dishes / crawls / crawl_stops), seeding notes, open questions.
- Branch `webapp` — created so `main` stays the live version while the webapp is built.

## Decisions ratified this session (owner chose via structured questions)

- **Audience:** friends visiting NYC *and a broader public audience* — not owner-only.
- **Content unit:** place + dishes + crawls, all first-class from day one.
- **Editing:** admin UI backed by a real database (Supabase free tier planned) — owner wants phone-friendly capture, explicitly rejected git-data-file and spreadsheet options.
- **Map:** lightweight embedded map (Leaflet + OpenStreetMap) alongside the list view; map-first UI explicitly rejected as the dumbed-down-Maps trap.
- **Permanently out of scope:** third-party reviews, star ratings, opening hours, full map engine.

## Findings worth remembering

- The five existing Google Maps lists are the seed data, but the short links are opaque (verified 2026-09-02; pizza/coffee were once swapped). Seeding requires the owner to dictate/export the actual place lists — do not scrape or guess.
- Bilingual rule for the app: Hebrew may lag English; UI falls back to EN when a `_he` field is empty. Publishing is never blocked on translation.
- GoatCounter (`kobim`) carries over; keep event-name continuity where events map 1:1 to the old page.
- Known accepted limitation for v1: client-side rendering → weak SEO. Fix later with pre-rendering if the broader audience materializes.

## Next steps, in order

1. Owner reads `plans/webapp_2026-09-03.md` and flags disagreements — the spec is a living doc, append to its Log section.
2. Commit the spec (and this handoff) on `webapp`. Not done yet because owner hasn't asked for a commit.
3. Owner creates a Supabase project (~2 min, needs their account). **Blocked on owner.** Then: schema, RLS (anon read on published rows, writes restricted to owner's email), magic-link auth.
4. Scaffold the frontend (Vite; framework TBD at implementation start) + `/admin` route against a local mock — can proceed in parallel, not blocked on step 3.
5. Seed places: owner dictates/exports the five lists' contents. **Blocked on owner.**
6. Resolve open questions from the spec: where the app lives (replace page / subpath / subdomain — ties into possible custom domain), photo storage (Supabase Storage vs. repo `images/`).

## Operational cautions

- `main` is the live site — do not merge `webapp` or touch `index.html`'s deployed behavior until the app is ready to replace it. All prior cautions about `main` still apply (pull-rebase first, both language blocks, don't rename GoatCounter events).
- The spec is a living plan document: append results and log entries, never overwrite ratified decisions.
- Don't guess which Maps short link is which list. Ever. Ask.
- Claude-in-Chrome doesn't work in this environment — use curl.
