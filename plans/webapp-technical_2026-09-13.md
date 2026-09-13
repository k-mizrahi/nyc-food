# NYC Food Webapp — Technical Plan (living document)

Started 2026-09-13, immediately after owner ratified product spec v2 (`webapp_2026-09-03.md`). Scope here: Phase 1 (admin UI, triage mode) + the two standing flows. Phase 2 (public app) gets its own plan when Phase 1 ships.

## Ground truth about the seed data (verified against files, 2026-09-13)

- **The 43 CSVs in `meterials/Takeout/Saved/` are the ONLY seed source.** Owner deleted the rest of the Takeout export (incl. `Saved Places.json`) on 2026-09-13: the saved lists are the actual maps he wants; the 180 default-saved places are out.
- CSV shape: `Title,Note,URL,Tags,Comment`. **Parser traps:** some files open with a free-text description line before the header (e.g. "Kobi_s list of food to try.csv"); some contain fully blank rows (e.g. "Pizza places.csv" row 2); one entry ("Dandi and Avia Sep. 2026") is a directory, not a CSV. Tags/Comment empty in practice. Notes mixed Hebrew/English.
- CSV `URL` embeds an FTID hex pair: regex `!1s(0x[0-9a-f]+:0x[0-9a-f]+)` (URL-decoded form) inside the `data=` segment. The second hex value, converted to decimal, is the CID. **Cross-list dedup key: CID.** No coordinates anywhere in the seed data — coordinates come only from enrichment.
- **FTID/CID are NOT API place IDs.** Places API (New) wants `ChIJ…` ids. Resolution: one-time Text Search (`places:searchText`, Pro tier) per kept place with `textQuery = title` + `locationBias` (NYC bounds). Store the returned `ChIJ…` id; surface Google's returned name next to the CSV title in triage so the owner catches bad matches. ~250 calls, within the 5,000/mo Pro free tier.

## Stack decisions (proposed — confirm at kickoff)

| Item | Choice | Why |
|---|---|---|
| Frontend | Vite + React + TypeScript + supabase-js | Boring, well-documented, fine on phone; react-leaflet exists for Phase 2 |
| Styling | Plain CSS custom properties (same approach as the static page) | No framework tax for an admin tool; reuse the existing light/dark tokens |
| Repo layout | `app/` directory in this repo, on `webapp` branch | One repo, one history; deploy target decided in Phase 2 |
| Import script | Python (stdlib csv/json + supabase REST via requests) | One-time, runs locally with the service-role key from env; not committed with secrets |
| Refresh job | GitHub Actions monthly cron + the same Python codebase | Free, secrets in repo settings; ratified "likely GH Actions" in spec v2 |

## Schema (Supabase Postgres)

```sql
-- Staging: every Takeout row lands here verbatim; triage never edits source data
create table import_rows (
  id            bigint generated always as identity primary key,
  source_file   text not null,          -- e.g. 'Pizza places.csv'
  row_num       int,
  title         text,
  note          text,
  url           text,
  ftid          text,                   -- '0x..:0x..' from CSV url
  cid           numeric,                -- decimal; the cross-list dedup key
  triage_status text not null default 'pending'
                check (triage_status in ('pending','kept','dropped')),
  place_id      uuid references places(id),   -- set when kept/merged
  created_at    timestamptz default now()
);

create table lists (            -- provenance + bulk triage unit
  id           bigint generated always as identity primary key,
  name         text not null,
  source_file  text unique not null,
  default_action text not null default 'review'
               check (default_action in ('keep','drop','review'))
);

create table places (
  id             uuid primary key default gen_random_uuid(),
  slug           text unique not null,
  name           text not null,                 -- owner-owned display name
  status         text not null default 'want_to_try'
                 check (status in ('recommended','want_to_try','closed','demoted')),
  rec_source     text,                          -- ADMIN-ONLY (excluded from public view)
  note_en text, note_he text,
  cuisine        text,                          -- facet
  borough        text,                          -- facet
  neighborhood   text,                          -- facet (refreshed-class per spec; owner may override → owner_neighborhood wins if set)
  price_level    smallint,                      -- refreshed (Pro)
  business_status text,                         -- ADMIN-ONLY, refreshed (Pro)
  google_place_id text unique,                  -- static ('ChIJ…')
  cid            numeric unique,                -- static, import cross-link
  gmaps_url      text,                          -- static
  lat double precision, lng double precision,   -- refreshed (Essentials)
  address        text,                          -- refreshed (Essentials)
  refreshed_at   timestamptz,
  published      boolean not null default false,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table place_lists (      -- which Takeout lists a place came from
  place_id uuid references places(id) on delete cascade,
  list_id  bigint references lists(id),
  primary key (place_id, list_id)
);

create table tags (             -- owner-curated controlled list
  id       bigint generated always as identity primary key,
  slug     text unique not null,
  label_en text not null,
  label_he text
);

create table place_tags (
  place_id uuid references places(id) on delete cascade,
  tag_id   bigint references tags(id) on delete cascade,
  source   text not null default 'owner' check (source in ('owner','google_prefill')),
  approved boolean not null default true,   -- google_prefill rows start false; triage flips or deletes
  primary key (place_id, tag_id)
);

-- dishes / crawls / crawl_stops exactly as the v1 sketch (Phase 2 tables, created now, empty)

create table alerts (           -- monthly-refresh output, admin-only
  id         bigint generated always as identity primary key,
  place_id   uuid references places(id) on delete cascade,
  kind       text not null,     -- 'closure' | 'price_change' | …
  detail     jsonb,
  resolved   boolean not null default false,
  created_at timestamptz default now()
);
```

## RLS / access model

- Owner = JWT email `mizrahi.kobi@gmail.com` (Supabase magic-link auth). Helper: `is_owner()` security-definer function checking `auth.jwt()->>'email'`.
- **All tables:** RLS on; owner gets full CRUD. Anonymous role gets **no direct table grants** on `places` (column-level secrecy for `rec_source`/`business_status` can't be done with row-level policies alone).
- **Public read path:** view `public_places` (security invoker OFF / definer) selecting only public columns `where published`, plus `public_place_tags` (`approved` only), `public_dishes`, `public_crawls`. Grant `select` on views to `anon`. Phase 2 consumes only the views.
- `import_rows`, `lists`, `alerts`: owner-only, no public path ever.
- The freshness rule is enforced structurally: refreshed-class columns live in the view only because the monthly job exists; if the job is ever retired, drop those columns from the view.

## Phase 1 build order

Each step lands as a commit on `webapp`; check off here as done.

1. **[owner] Accounts** — Supabase project (free tier); Google Cloud project with **Places API (New)** enabled, card attached, and quota caps set to free-tier limits (Essentials 10K, Pro 5K, Enterprise 0 — deny Enterprise entirely).
2. **Migration** — `app/supabase/migrations/0001_init.sql` with the schema + RLS above. Applied via Supabase SQL editor or CLI.
3. **Import script** — `app/scripts/import_takeout.py`: walk `meterials/Takeout/Saved/*.csv` (skip preamble lines: first row not matching the header is a list description → store on `lists.name`? No — filename is the name; store description in a `lists.description` column), skip blank rows, extract FTID/CID; insert into `import_rows` + `lists`. Report: rows per file, rows with/without CID, cross-list CID-duplicate count. **No try/except around loads; raise on anomalies.**
4. **Admin app scaffold** — Vite React TS in `app/`, Supabase magic-link login gate, single `/admin` surface.
5. **Triage screen A — Lists**: table of 43 lists with row counts and `default_action` toggle; "drop whole list" bulk-sets its pending rows (per-row override preserved: bulk actions only touch `pending` rows).
6. **Triage screen B — Review queue**: pending rows grouped by CID (cross-list dupes shown together). Keyboard-first: keep/drop, status, cuisine, borough/neighborhood, rec_source (pre-split from note when a known pattern like "המלצה של…" appears — suggestion only), note edit. Keep → creates/merges `places` row (notes unioned, `place_lists` written), enrichment queued.
7. **Enrichment** — on keep: `places:searchText` resolve → `ChIJ…` id → Place Details (field mask: location, formattedAddress, priceLevel, businessStatus, and the four attribute fields for tag pre-fill) → write place + `google_prefill` tag rows (`approved=false`). Show Google's name vs. CSV title for mismatch catch. All API calls server-side? No server exists — calls go through a tiny Supabase Edge Function so the Maps key never ships to the browser.
8. **Tag curation** — during triage, owner adds tags to the `tags` table as real needs appear (spec: draft the list with real places on screen).
9. **Refresh job** — `.github/workflows/monthly-refresh.yml` (cron, 1st of month): re-fetch refreshed-class fields for all `places` with a `google_place_id`; diff `business_status` → insert `alerts`. Secrets: `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_MAPS_API_KEY`.
10. **Quick-add** — admin form: paste a Maps URL → extract FTID/CID or resolve by text → enrichment path from step 7 → draft place for owner to finish.

## Open questions (technical)

- Supabase Edge Function vs. calling Places API from the import script only (triage runs locally anyway; Edge Function may be overkill for Phase 1 — decide at step 7).
- `neighborhood`: Google's `addressComponents` neighborhoods are inconsistent for NYC; likely owner-set facet with Google only as a hint. Decide during triage.
- Whether `import_rows` ever gets purged after triage completes (lean: keep, it's provenance).

## Log

- 2026-09-13 — **Step 4 DONE.** Admin scaffold at `app/web/` (subdir chosen so `scripts/` and `supabase/` stay siblings): Vite + React 19 + TS + supabase-js. Magic-link login (`signInWithOtp`, redirect to `window.location.origin`), cosmetic owner-email gate in `App.tsx` (RLS remains the real boundary), `Admin.tsx` smoke-tests owner access with counts from `lists`/`import_rows`. Supabase URL + publishable key hardcoded with `VITE_*` env override (both public by design; `.env.example` documents). `tsc -b && vite build` clean; dev server verified serving via curl. **Owner action needed before first login:** in Supabase Auth settings, set Site URL (or add redirect URL) `http://localhost:5173` — default is `localhost:3000`, so the magic link would redirect wrong. Consider also disabling public signups (harmless either way — non-owner JWTs see nothing).
- 2026-09-13 — **Steps 1–3 DONE.** Accounts created (Supabase project `svrcpzerrbxnzywddyzz`, publishable key in chat history; GCP project w/ Places API (New), per-endpoint quota caps: SearchText/GetPlace 300/day + 60/min, all unused endpoints 0, $1 budget alert). Migration `0001_init.sql` applied clean. Import script run with `--load`: **42 lists, 1,015 rows staged; 850 distinct CIDs; 127 CIDs span multiple lists (287 rows to merge); 5 rows lack CID.** Access model verified via curl: anon sees `public_places=[]`, gets 42501 permission-denied on `places` and `import_rows`. Gotchas: real file count is 42 (not 43 — one entry is an extensionless CSV, "Dandi and Avia Sep. 2026", parsed fine); dashboard copy of SUPABASE_URL includes `/rest/v1` suffix — script strips it. Next: step 4, admin app scaffold.
- 2026-09-13 — **Resolved, owner decision:** the deletion below was the owner, on purpose — only `Saved/` (the 43 CSV lists, "the actual maps I want") is seed data; `Saved Places.json` and the 180 default-saved places are permanently out of scope. Plan updated to CSV-only: `import_rows` drops the JSON-only columns, dedup is CID-within-CSVs, Text Search uses NYC-bounds bias only.
- 2026-09-13 — ~~Data loss flag~~ (superseded above): `meterials/Takeout/Maps/` and `Maps (your places)/Saved Places.json` (180 places w/ lat/lng + CID) existed and were read at session start, then vanished from disk before the commit — not deleted by any command in this session; not in Trash; Spotlight and ~/Downloads find nothing. Commit `1e2a183` therefore contains only `Saved/` (43 CSV lists). Owner must restore the JSON (re-export Takeout or recover the original zip) before import-script work — it is the only coordinate/CID source for the 180 default-saved places. Import pipeline is unblocked for the CSV side regardless (FTIDs are in the CSVs; Text Search resolution never needed the JSON coords, they were a bias hint).
- 2026-09-13 — Plan created. Spec v2 ratified by owner the same session; owner also decided `meterials/` gets committed (chosen over gitignore, aware branch is local until pushed). Data-shape traps verified against real files (preamble lines, blank rows, one directory among the CSVs). FTID/CID ≠ API place ID finding recorded; Text Search resolution step added.
