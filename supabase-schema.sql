-- PLANORA DATABASE SETUP
-- Run this entire file once in Supabase Dashboard > SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text default '',
  display_name text default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  theme text not null default 'system' check (theme in ('light','dark','system')),
  density text not null default 'comfortable' check (density in ('compact','comfortable')),
  currency text not null default 'PHP',
  ai_detail_level text not null default 'balanced' check (ai_detail_level in ('concise','balanced','detailed')),
  planning_preferences text default '',
  event_reminders boolean not null default true,
  planning_reminders boolean not null default false,
  reminder_time time default '09:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New Event',
  event_type text,
  event_date date,
  location text,
  guest_count integer check (guest_count is null or guest_count > 0),
  budget numeric(14,2) check (budget is null or budget >= 0),
  theme text,
  status text not null default 'Planning',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists events_user_id_idx on public.events(user_id);
create index if not exists messages_event_id_idx on public.messages(event_id);
create index if not exists messages_user_id_idx on public.messages(user_id);

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.events enable row level security;
alter table public.messages enable row level security;

-- Re-runnable policy setup.
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles_delete_own" on public.profiles for delete using (auth.uid() = id);

drop policy if exists "settings_select_own" on public.user_settings;
drop policy if exists "settings_insert_own" on public.user_settings;
drop policy if exists "settings_update_own" on public.user_settings;
drop policy if exists "settings_delete_own" on public.user_settings;
create policy "settings_select_own" on public.user_settings for select using (auth.uid() = user_id);
create policy "settings_insert_own" on public.user_settings for insert with check (auth.uid() = user_id);
create policy "settings_update_own" on public.user_settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "settings_delete_own" on public.user_settings for delete using (auth.uid() = user_id);

drop policy if exists "events_select_own" on public.events;
drop policy if exists "events_insert_own" on public.events;
drop policy if exists "events_update_own" on public.events;
drop policy if exists "events_delete_own" on public.events;
create policy "events_select_own" on public.events for select using (auth.uid() = user_id);
create policy "events_insert_own" on public.events for insert with check (auth.uid() = user_id);
create policy "events_update_own" on public.events for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "events_delete_own" on public.events for delete using (auth.uid() = user_id);

drop policy if exists "messages_select_own" on public.messages;
drop policy if exists "messages_insert_own" on public.messages;
drop policy if exists "messages_delete_own" on public.messages;
create policy "messages_select_own" on public.messages for select using (auth.uid() = user_id and exists (select 1 from public.events e where e.id = event_id and e.user_id = auth.uid()));
create policy "messages_insert_own" on public.messages for insert with check (auth.uid() = user_id and exists (select 1 from public.events e where e.id = event_id and e.user_id = auth.uid()));
create policy "messages_delete_own" on public.messages for delete using (auth.uid() = user_id);
