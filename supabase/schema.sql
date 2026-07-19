-- Seymour: accounts + per-record cross-device sync.
--
-- Run this once in your Supabase project's SQL editor (Project → SQL Editor
-- → New query → paste → Run). It's idempotent-ish via IF NOT EXISTS / OR
-- REPLACE, so re-running it after a partial failure is safe.
--
-- Design notes:
--   - RLS is enabled on every table: a row is only visible to the user who
--     owns it (auth.uid() = user_id). The anon key is safe to ship to the
--     client because of this.
--   - `updated_at` is set by a trigger (server clock), never trusted from
--     the client, so device clock skew can't win a conflict it shouldn't.
--   - Sync is last-write-wins *per record*, not per user's whole dataset —
--     see the shared trigger below and src/lib/sync.ts. Two devices editing
--     different rows concurrently both survive; two devices editing the
--     *same* row concurrently, the later write wins.
--   - `deleted_records` is a tombstone table: deletes are propagated by
--     recording (entity, record_id) here rather than by clients diffing
--     "what's missing", which can't distinguish a delete from a device that
--     just hasn't synced yet.
--   - Shopping-list item ids and meal-plan day indices are NOT globally
--     unique (they're deterministic per ingredient / per day-of-week), so
--     those tables use composite primary keys scoped by user_id. Recipe and
--     archived-plan ids are client-generated nanoids and effectively
--     globally unique, but are still scoped by user_id in the primary key
--     for consistency and defense in depth.

-- --- Shared "set updated_at to now() on every write" trigger -------------

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- --- Recipes ---------------------------------------------------------------

create table if not exists public.recipes (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  title text not null,
  source_url text not null default '',
  image_url text,
  ingredients jsonb not null default '[]'::jsonb,
  instructions jsonb not null default '[]'::jsonb,
  date_added timestamptz not null default now(),
  meal_types jsonb,
  category text,
  main_ingredient text,
  cook_time_minutes integer,
  rating numeric,
  notes text,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Added after the initial release — `create table if not exists` above is a
-- no-op on a database that already has this table, so existing projects need
-- these explicitly. Safe to re-run.
alter table public.recipes add column if not exists rating numeric;
alter table public.recipes add column if not exists notes text;

alter table public.recipes enable row level security;

drop policy if exists "recipes are owner-only" on public.recipes;
create policy "recipes are owner-only" on public.recipes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists set_updated_at on public.recipes;
create trigger set_updated_at before insert or update on public.recipes
  for each row execute function public.set_updated_at();

-- --- Meal plan: config (single row per user) + days (one row per day) -----

create table if not exists public.meal_plan_config (
  user_id uuid primary key references auth.users (id) on delete cascade,
  days integer not null,
  meal_types jsonb not null,
  seed bigint not null,
  updated_at timestamptz not null default now()
);

alter table public.meal_plan_config enable row level security;

drop policy if exists "meal_plan_config is owner-only" on public.meal_plan_config;
create policy "meal_plan_config is owner-only" on public.meal_plan_config
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists set_updated_at on public.meal_plan_config;
create trigger set_updated_at before insert or update on public.meal_plan_config
  for each row execute function public.set_updated_at();

create table if not exists public.meal_plan_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  day_index integer not null,
  date text not null,
  meals jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, day_index)
);

alter table public.meal_plan_days enable row level security;

drop policy if exists "meal_plan_days is owner-only" on public.meal_plan_days;
create policy "meal_plan_days is owner-only" on public.meal_plan_days
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists set_updated_at on public.meal_plan_days;
create trigger set_updated_at before insert or update on public.meal_plan_days
  for each row execute function public.set_updated_at();

-- --- Archived plans ---------------------------------------------------------

create table if not exists public.archived_plans (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  archived_at timestamptz not null,
  label text not null,
  config jsonb not null,
  plan jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.archived_plans enable row level security;

drop policy if exists "archived_plans is owner-only" on public.archived_plans;
create policy "archived_plans is owner-only" on public.archived_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists set_updated_at on public.archived_plans;
create trigger set_updated_at before insert or update on public.archived_plans
  for each row execute function public.set_updated_at();

-- --- Shopping list items -----------------------------------------------
--
-- Only the user-owned, mutable part of an item syncs: whether it's checked
-- and any manual-override text. Everything else about an item (which
-- ingredients exist, their quantities, which recipes they came from) is
-- *derived* — recomputed locally by buildShoppingList() from the plan,
-- recipes, and pantry staples, all of which sync independently. Two devices
-- with the same plan/recipes/staples compute the same items on their own;
-- syncing the computed fields too would just create spurious conflicts
-- between two correct-but-independently-recomputed values.

create table if not exists public.shopping_list_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  checked boolean not null default false,
  manual_override text,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.shopping_list_items enable row level security;

drop policy if exists "shopping_list_items is owner-only" on public.shopping_list_items;
create policy "shopping_list_items is owner-only" on public.shopping_list_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists set_updated_at on public.shopping_list_items;
create trigger set_updated_at before insert or update on public.shopping_list_items
  for each row execute function public.set_updated_at();

-- --- Pantry staples ("spice rack") — whole list as one row per user -------

create table if not exists public.pantry_staples (
  user_id uuid primary key references auth.users (id) on delete cascade,
  staples jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.pantry_staples enable row level security;

drop policy if exists "pantry_staples is owner-only" on public.pantry_staples;
create policy "pantry_staples is owner-only" on public.pantry_staples
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists set_updated_at on public.pantry_staples;
create trigger set_updated_at before insert or update on public.pantry_staples
  for each row execute function public.set_updated_at();

-- --- Settings — one row per user -------------------------------------------

create table if not exists public.settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  unit_system text not null default 'imperial',
  updated_at timestamptz not null default now()
);

alter table public.settings enable row level security;

drop policy if exists "settings is owner-only" on public.settings;
create policy "settings is owner-only" on public.settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists set_updated_at on public.settings;
create trigger set_updated_at before insert or update on public.settings
  for each row execute function public.set_updated_at();

-- --- Tombstones: propagate deletes across devices ---------------------

create table if not exists public.deleted_records (
  user_id uuid not null references auth.users (id) on delete cascade,
  entity text not null,
  record_id text not null,
  deleted_at timestamptz not null default now(),
  primary key (user_id, entity, record_id)
);

alter table public.deleted_records enable row level security;

drop policy if exists "deleted_records is owner-only" on public.deleted_records;
create policy "deleted_records is owner-only" on public.deleted_records
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- --- Realtime: broadcast changes on synced tables to subscribed clients ---
--
-- The default `supabase_realtime` publication starts empty; a table must be
-- added explicitly before postgres_changes subscriptions receive anything
-- for it (see subscribeRealtime in src/lib/sync.ts). Guarded because ALTER
-- PUBLICATION ... ADD TABLE errors on a table that's already a member,
-- which would otherwise break re-running this script.

do $$
declare
  t text;
begin
  foreach t in array array[
    'recipes',
    'shopping_list_items',
    'meal_plan_config',
    'meal_plan_days',
    'archived_plans',
    'pantry_staples',
    'settings',
    'deleted_records'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
