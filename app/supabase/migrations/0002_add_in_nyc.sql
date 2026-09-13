-- 0002_add_in_nyc.sql — internal NYC yes/no flag on places.
-- Owner decision 2026-09-13: non-NYC places from the lists are kept for possible
-- future city expansion, flagged rather than dropped. Admin-only: deliberately
-- NOT added to public_places; `published` remains the only public gate.

alter table public.places
  add column in_nyc boolean not null default true;
