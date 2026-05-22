-- Vinlistor — Supabase schema.
-- Run this in the Supabase SQL editor (project ref ybyynrlfqbbjkybgldrm).
-- Idempotent-ish: safe to re-run; uses IF NOT EXISTS where possible.

create extension if not exists "pgcrypto";

-- One row per restaurant.
create table if not exists restaurants (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  area          text,                       -- stadsdel, e.g. Östermalm, Södermalm
  address       text,
  website       text,
  wine_list_url text,                        -- where the wine list was fetched from
  created_at    timestamptz not null default now(),
  unique (name)
);

-- One row per wine-as-listed-at-a-restaurant.
create table if not exists wines (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name          text not null,              -- wine name exactly as listed
  producer      text,
  vintage       int,                         -- null = NV / not stated
  type          text,                        -- rött / vitt / mousserande / rosé / orange / dessert / annat
  country       text,
  region        text,
  grape         text,
  price_glass   numeric(10,2),               -- per glass, null if not offered by glass
  price_bottle  numeric(10,2),               -- per bottle
  currency      text not null default 'SEK',
  source_url    text,                        -- the menu URL this came from
  collected_at  timestamptz not null default now()
);

create index if not exists wines_restaurant_idx on wines (restaurant_id);
create index if not exists wines_name_idx        on wines (name);
create index if not exists wines_type_idx        on wines (type);

-- A run replaces a restaurant's wines wholesale (delete + insert) so prices stay current.
-- See src/lib/db.mjs.
