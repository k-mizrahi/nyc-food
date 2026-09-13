-- 0001_init.sql — nyc-food schema, per plans/webapp-technical_2026-09-13.md
-- Run once in the Supabase SQL Editor (or psql). Idempotence not attempted; a
-- failed partial run should be fixed by dropping the schema objects and rerunning.

-- ---------------------------------------------------------------- owner check

create or replace function public.is_owner()
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'mizrahi.kobi@gmail.com'
$$;

-- ---------------------------------------------------------------- core tables

create table public.places (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,
  name            text not null,
  status          text not null default 'want_to_try'
                  check (status in ('recommended','want_to_try','closed','demoted')),
  rec_source      text,            -- admin-only: excluded from public view
  note_en         text,
  note_he         text,
  cuisine         text,
  borough         text,
  neighborhood    text,
  price_level     smallint check (price_level between 1 and 4),
  business_status text,            -- admin-only: feeds closure alerts, never shown raw
  google_place_id text unique,     -- 'ChIJ…', static once resolved
  cid             numeric unique,  -- decimal CID from Takeout URL, import dedup key
  gmaps_url       text,
  lat             double precision,
  lng             double precision,
  address         text,
  refreshed_at    timestamptz,
  published       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.lists (
  id             bigint generated always as identity primary key,
  name           text not null,
  description    text,            -- preamble line some CSVs carry above the header
  source_file    text unique not null,
  default_action text not null default 'review'
                 check (default_action in ('keep','drop','review'))
);

create table public.import_rows (
  id            bigint generated always as identity primary key,
  source_file   text not null,
  row_num       int,
  title         text,
  note          text,
  url           text,
  ftid          text,             -- '0x…:0x…' pair from the URL data= segment
  cid           numeric,          -- decimal form of the second ftid hex; dedup key
  triage_status text not null default 'pending'
                check (triage_status in ('pending','kept','dropped')),
  place_id      uuid references public.places(id),
  created_at    timestamptz not null default now()
);

create index import_rows_triage_idx on public.import_rows (triage_status);
create index import_rows_cid_idx    on public.import_rows (cid);

create table public.place_lists (
  place_id uuid   not null references public.places(id) on delete cascade,
  list_id  bigint not null references public.lists(id),
  primary key (place_id, list_id)
);

create table public.tags (
  id       bigint generated always as identity primary key,
  slug     text unique not null,
  label_en text not null,
  label_he text
);

create table public.place_tags (
  place_id uuid   not null references public.places(id) on delete cascade,
  tag_id   bigint not null references public.tags(id) on delete cascade,
  source   text not null default 'owner' check (source in ('owner','google_prefill')),
  approved boolean not null default true,  -- google_prefill rows insert with false
  primary key (place_id, tag_id)
);

create table public.dishes (
  id         bigint generated always as identity primary key,
  place_id   uuid not null references public.places(id) on delete cascade,
  name_en    text,
  name_he    text,
  note_en    text,
  note_he    text,
  must_order boolean not null default false,
  sort_order int not null default 0
);

create table public.crawls (
  id        uuid primary key default gen_random_uuid(),
  slug      text unique not null,
  title_en  text not null,
  title_he  text,
  intro_en  text,
  intro_he  text,
  published boolean not null default false
);

create table public.crawl_stops (
  id         bigint generated always as identity primary key,
  crawl_id   uuid not null references public.crawls(id) on delete cascade,
  place_id   uuid not null references public.places(id),
  stop_order int not null,
  note_en    text,
  note_he    text,
  unique (crawl_id, stop_order)
);

create table public.alerts (
  id         bigint generated always as identity primary key,
  place_id   uuid references public.places(id) on delete cascade,
  kind       text not null,       -- 'closure' | 'price_change' | …
  detail     jsonb,
  resolved   boolean not null default false,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------ updated_at hook

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger places_touch before update on public.places
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------------ RLS

-- Owner (matched by JWT email) gets full CRUD on everything; anon gets nothing
-- at the table level — public reads go through the views below only.
do $$
declare t text;
begin
  foreach t in array array['places','lists','import_rows','place_lists','tags',
                           'place_tags','dishes','crawls','crawl_stops','alerts']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy owner_all on public.%I for all to authenticated
         using (public.is_owner()) with check (public.is_owner())', t);
  end loop;
end $$;

revoke all on all tables in schema public from anon;

-- --------------------------------------------------------------- public views
-- security_invoker OFF (default): views read as their owner, bypassing RLS —
-- deliberate; each view filters published rows and exposes only public columns.
-- rec_source and business_status never appear here.

create view public.public_places as
  select id, slug, name, status, note_en, note_he,
         cuisine, borough, neighborhood, price_level,
         gmaps_url, lat, lng, address, refreshed_at
  from public.places
  where published;

create view public.public_place_tags as
  select pt.place_id, t.slug, t.label_en, t.label_he
  from public.place_tags pt
  join public.tags t on t.id = pt.tag_id
  join public.places p on p.id = pt.place_id
  where pt.approved and p.published;

create view public.public_dishes as
  select d.id, d.place_id, d.name_en, d.name_he, d.note_en, d.note_he,
         d.must_order, d.sort_order
  from public.dishes d
  join public.places p on p.id = d.place_id
  where p.published;

create view public.public_crawls as
  select id, slug, title_en, title_he, intro_en, intro_he
  from public.crawls
  where published;

create view public.public_crawl_stops as
  select cs.id, cs.crawl_id, cs.place_id, cs.stop_order, cs.note_en, cs.note_he
  from public.crawl_stops cs
  join public.crawls c on c.id = cs.crawl_id
  where c.published;

grant select on public.public_places, public.public_place_tags,
                public.public_dishes, public.public_crawls,
                public.public_crawl_stops
  to anon, authenticated;
