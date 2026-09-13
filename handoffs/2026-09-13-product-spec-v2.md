# Handoff — 2026-09-13: product spec v2 ratified — seed data landed, admin-first, Google policy settled

## Where things stand

- Static site still live and untouched: https://k-mizrahi.github.io/nyc-food/ serves from `main` at `f3684a6`. All work is on branch `webapp` (local only, not pushed), and everything webapp-related is still untracked: `plans/`, `handoffs/`, `meterials/` all show as `??` in git status.
- Product spec is complete through v2: `plans/webapp_2026-09-03.md` now has a "Product spec v2 (2026-09-13)" section appended (v1 kept intact above it). Owner has NOT yet read/approved v2 — that's the gate before technical planning.
- Seed data exists on disk: `meterials/Takeout/` — Google Takeout export dated 2026-09-13. **43 CSV lists, ~1,080 rows** (not the five lists v1 assumed). CSV shape: `Title, Note, URL, Tags, Comment`; Tags/Comment empty in practice; notes mixed Hebrew/English. Plus `Maps (your places)/Saved Places.json`: 180 places WITH lat/lng + address + CID (the CSVs have no coordinates).
- Expected DB size after triage: ~150–250 NYC food places. Largest list is "Kobi_s list of food to try.csv" (~395 rows). Many lists are out of scope (Israel, Barcelona, London, SF, parks, galleries, shops).
- Zero implementation exists. No Supabase project, no frontend, no schema anywhere.

## What changed this session

- `plans/webapp_2026-09-03.md` — appended product spec v2: decisions table (2026-09-13), source-data reality, field model (owner-owned / static / refreshed classes), phases (admin-triage first, public app second, two standing flows), cost model, carried + new open questions, log entries.
- `handoffs/2026-09-13-product-spec-v2.md` — this file.
- `meterials/Takeout/` — appeared this session (owner exported it); inspected, not modified.

## Decisions ratified this session (owner chose via structured questions)

- **Import scope: NYC food/drink only.** Triage sees everything; only NYC food enters the DB. No `city` field.
- **The cleaning UI IS the admin UI** — no throwaway tool. Triage mode is its first job; same screens later do day-to-day edits and quick-add.
- **Labels: structured facets + owner-curated tag list.** Facets: cuisine, borough/neighborhood, price tier, status. Free-form tags rejected.
- **Google enrichment: Essentials + Pro tiers only, monthly refresh.** Enterprise tier (hours, phone, website) never touched — Maps link-out covers those. Price level shown publicly; business status feeds admin-only closure alerts; Google attributes (kid-friendly / outdoor seating / vegetarian / takeout) do a ONE-TIME tag-suggestion pre-fill at import, then tags are owner-owned.
- **Freshness rule (owner's doctrine):** any Google-sourced field shown publicly is refreshed at least monthly, or not shown at all.
- **Hours stay out** — v1's ratified decision was questioned and re-confirmed after a cost-per-cadence table.
- **Visited-or-not is NOT a new field** — it's the existing `status` enum (`recommended` = tried & endorse, `want_to_try` = untried). New owner field: `rec_source` (admin-only in v1).

## Findings worth remembering

- Google Places API pricing (verified 2026-09-13 via web search): the $200 monthly credit is gone (since 2025-03-01); per-SKU free tiers instead — Essentials 10K, Pro 5K, Enterprise 1K free calls/month. A Place Details call bills at the highest tier of any requested field. At ~250 places monthly: $0. Cost table by cadence is in the conversation's spirit but the spec records the policy: monthly, Pro-tier ceiling, quota caps set at free-tier limits in Cloud console so overage is structurally impossible. Requires a card on a Google Cloud account.
- The CSV `URL` column embeds a stable Google place identifier (hex pair in the `data=` segment) → usable for cross-list dedup and API lookups without scraping. `Saved Places.json` uses decimal CIDs; the two are cross-linkable.
- Some imported notes already contain the rec source inline (e.g. a friend's name in Hebrew) — triage should split those into `rec_source`.
- Folder is spelled `meterials/` (sic) — keep the typo, paths reference it.

## Next steps, in order

1. **Owner reads spec v2** (`plans/webapp_2026-09-03.md`, from "Product spec v2" down) and flags disagreements. **Blocked on owner.** Everything below waits on this.
2. Commit `plans/`, `handoffs/`, and decide whether `meterials/` gets committed or gitignored (it contains personal data across many cities — lean gitignore; decide with owner). Not done — owner hasn't asked for a commit.
3. Technical planning session: Supabase schema (from the v2 field model), RLS, triage-UI screens, import pipeline (43 CSVs + Saved Places.json → staging table), refresh job design (likely GitHub Actions).
4. Owner creates Supabase project + Google Cloud project w/ Places API, quota caps at free-tier limits. **Blocked on owner** (accounts/card).
5. Build Phase 1: admin UI in triage mode (keep/drop, place-ID dedup w/ note merging, status/rec_source/tags, resumable progress).
6. Draft the initial curated tag list DURING triage with real places on screen — not in the abstract.

## Operational cautions

- `main` is the live site — don't merge `webapp` or touch deployed `index.html` behavior. Pull-rebase before any `main` edit; both language blocks; never rename GoatCounter events.
- The spec is a living doc: append, never overwrite ratified decisions. v1 decisions stand unless the log says otherwise.
- Don't guess which Google Maps short link is which list. Ever. Ask.
- `meterials/Takeout/` contains personal data (all cities, friends' names in notes) — don't quote it wholesale into committed docs, and settle the commit-vs-gitignore question before any `git add .`.
- Claude-in-Chrome doesn't work in this environment — use curl.
- Owner approval gates the technical plan: do not start schema/implementation work before the owner signs off on spec v2.
