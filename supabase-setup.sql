-- Run this in the Supabase SQL Editor (Project → SQL Editor → New query)

-- ── Events table policies ────────────────────────────────────────────
-- (Skip the "create table" below if you already made the events table
-- by hand in the Table Editor — just run the policy section.)

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  title text not null,
  description text,
  event_date timestamptz not null,
  location text,
  created_by uuid references auth.users (id)
);

alter table events enable row level security;

create policy "Anyone can read events"
  on events for select
  using (true);

create policy "Authenticated users can insert events"
  on events for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update events"
  on events for update
  to authenticated
  using (true);

create policy "Authenticated users can delete events"
  on events for delete
  to authenticated
  using (true);

-- ── Churches table (for the map) ────────────────────────────────────

create table if not exists churches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  latitude double precision not null,
  longitude double precision not null
);

alter table churches enable row level security;

create policy "Anyone can read churches"
  on churches for select
  using (true);

-- No public insert policy on churches on purpose — add/edit churches
-- yourself via the Supabase Table Editor rather than from the site.