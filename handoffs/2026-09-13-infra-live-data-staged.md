# Handoff — 2026-09-13: spec v2 ratified, Supabase + GCP live, all 1,015 rows staged

## Where things stand

- Static site untouched and live: https://k-mizrahi.github.io/nyc-food/ serves from `main` at `f3684a6`. All webapp work is on branch `webapp` (LOCAL ONLY, never pushed), now at `847df56` — seven commits ahead of `main`, everything formerly-untracked is committed (plans, handoffs, `meterials/`, `app/`).
- **Spec v2 is owner-approved** (this session) — the gate from the previous handoff is lifted. Technical plan exists: `plans/webapp-technical_2026-09-13.md` (schema, RLS model, 10-step Phase 1 build order). Steps 1–3 are DONE; next is step 4 (admin app scaffold).
- **Supabase is live**: project ref `svrcpzerrbxnzywddyzz`, migration `app/supabase/migrations/0001_init.sql` applied clean (10 tables, RLS owner-only via JWT email `mizrahi.kobi@gmail.com`, public access only through `public_*` views). Verified by curl: anon gets `[]` from `public_places`, error 42501 on `places`/`import_rows`.
- **Staging is loaded**: 42 lists, 1,015 rows in `import_rows`/`lists` (verified counts post-load). 850 distinct places by CID; 127 CIDs span multiple lists (287 rows merge in triage); 5 rows lack a CID. Expected DB after triage still ~150–250 NYC food places.
- **Google Cloud is live**: project with Places API (New) enabled, card attached, API key restricted to that API. Quota locks set: SearchText & GetPlace 300/day + 60/min, ALL other endpoints (Autocomplete, Photos, Nearby, SearchMedia, ReviewPosts) capped at 0, plus a $1 budget alert. Tier control (Essentials/Pro/Enterprise) is NOT in quotas — it's the field mask in our code; never request Enterprise fields.
- Secrets live in `.env` at repo root (gitignored; template in `.env.example`): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (new-style `sb_secret_…`), `GOOGLE_MAPS_API_KEY`. Publishable key is fine in the open: `sb_publishable_4gNqjXKJzTd6xpBrNaN1fg_xn1g530S`.

## What changed this session

- `plans/webapp_2026-09-03.md` — log entries: owner approved spec v2; seed source narrowed to the 43→42 CSVs (owner deleted `Saved Places.json` deliberately); owner chose to COMMIT `meterials/` rather than gitignore.
- `plans/webapp-technical_2026-09-13.md` — NEW: full technical plan; then updated to CSV-only seed; steps 1–3 logged done with verified numbers.
- `app/supabase/migrations/0001_init.sql` — NEW: schema + RLS + public views. Applied to the live project via SQL Editor.
- `app/scripts/import_takeout.py` — NEW: parser + dry-run report + `--load` (refuses non-empty staging; validates counts post-load; no try/except around parsing).
- `.gitignore` / `.env.example` — NEW: `.DS_Store`, `.env` patterns; env template.
- `handoffs/`, `meterials/`, `plans/` — committed for the first time (were untracked).

## Findings worth remembering

- **Owner deleted `Saved Places.json` on purpose** — only `meterials/Takeout/Saved/` (the 42 list CSVs) is seed data. The 180 default-saved places are permanently out of scope. Do not treat this as data loss; do not resurrect.
- Real list count is **42, not 43**: "Dandi and Avia Sep. 2026" is a CSV missing its `.csv` extension; the import script globs all regular files in `Saved/`, so it parses fine.
- The Supabase dashboard's copy-paste of the project URL appends `/rest/v1` — the import script strips it (`re.sub(r"/rest/v1/?$", "", …)`). Any future script reading `SUPABASE_URL` from `.env` needs the same tolerance.
- New-style Supabase keys chosen over legacy JWT anon/service_role (independently rotatable, legacy is deprecated). They work as drop-in `apikey`/`Bearer` values against PostgREST — verified 2026-09-13.
- Google's quota page for Places API (New) is per-ENDPOINT, not per-tier. Billing tier is decided by the field mask per request. The cost lock is therefore two-layered: endpoint caps in Cloud console + field-mask discipline in code.
- FTID regex `!1s(0x[0-9a-f]+):(0x[0-9a-f]+)` against the URL-decoded CSV `URL` works on all but 5 of 1,015 rows. CID = int(second hex, 16). FTID/CID are NOT API place IDs — enrichment needs one-time `places:searchText` resolution with NYC locationBias, storing the returned `ChIJ…` id.
- Permission rules on this machine block reading even a single non-secret line out of `.env` (grep denied). Diagnostics that must touch env values go through a script that prints only hostnames/error bodies.
- Schema-change discipline agreed with owner: migrations in `app/supabase/migrations/` only, never the Table Editor.

## Next steps, in order

1. **Step 4 — admin app scaffold**: Vite + React + TS in `app/`, supabase-js, magic-link login gate (owner email), `/admin` surface. Frontend env: `VITE_SUPABASE_URL` + publishable key.
2. **Step 5 — triage screen A (Lists)**: 42 lists with row counts, `default_action` toggle, bulk keep/drop that touches only `pending` rows.
3. **Step 6 — triage screen B (Review queue)**: pending rows grouped by CID, keyboard-first keep/drop + status/cuisine/borough/rec_source/notes; keep → create/merge `places` row + `place_lists`.
4. **Step 7 — enrichment**: searchText resolve → Place Details (Essentials+Pro field mask only) → coords/address/price + `google_prefill` tag suggestions (`approved=false`). Decide then: Supabase Edge Function vs. local-only calls (Maps key must not ship to the browser).
5. Steps 8–10 per the technical plan: tag curation during triage, monthly refresh GitHub Action (include a weekly keepalive ping — free Supabase projects pause after ~7 idle days), quick-add flow.
6. Decide when to push `webapp` to GitHub (repo is public; owner already chose to include `meterials/`).

## Operational cautions

- `main` is the live site — never merge `webapp` into it or touch `index.html` behavior; pull-rebase before any `main` edit; both language blocks; never rename GoatCounter events.
- `.env` is unreadable by the agent, period — the permission system enforces it even for non-secret lines. Scripts read it at runtime; ask the owner to paste public values (URL, publishable key) into chat instead.
- Never request Enterprise-tier fields (hours, phone, website, reviews) from the Places API — spec-level ban plus the freshness doctrine.
- `import_rows` staging is loaded — the import script refuses to re-run against non-empty tables by design. Truncate deliberately only if a re-import is truly intended.
- Plans/spec are living docs: append to logs, never rewrite ratified decisions.
- Don't guess which Google Maps short link is which list. Ask.
- Claude-in-Chrome doesn't work in this environment — curl for anything web.
