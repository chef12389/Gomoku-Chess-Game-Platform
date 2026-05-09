create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.game_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  mode text not null check (mode in ('free', 'standard')),
  player_mode text not null check (player_mode in ('ai', 'local', 'online')),
  winner text,
  reason text,
  moves jsonb not null default '[]'::jsonb,
  duration_seconds int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.game_records
drop column if exists opening_name;

drop table if exists public.openings;

create table if not exists public.online_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_id uuid references auth.users(id) on delete set null,
  guest_id uuid references auth.users(id) on delete set null,
  host_email text,
  guest_email text,
  host_color text not null default 'black' check (host_color in ('black', 'white')),
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  board jsonb not null,
  moves jsonb not null default '[]'::jsonb,
  chat_messages jsonb not null default '[]'::jsonb,
  next_color text not null default 'black' check (next_color in ('black', 'white')),
  winner text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.online_rooms
add column if not exists chat_messages jsonb not null default '[]'::jsonb;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    case when lower(new.email) = lower(current_setting('app.admin_email', true)) then 'admin' else 'user' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.game_records enable row level security;
alter table public.online_rooms enable row level security;

drop policy if exists "profiles readable by owner or admin" on public.profiles;
create policy "profiles readable by owner or admin"
on public.profiles for select
using (
  auth.uid() = id
  or public.is_admin()
);

drop policy if exists "profiles owner update" on public.profiles;
create policy "profiles owner update"
on public.profiles for update
using (auth.uid() = id);

drop policy if exists "records insert authenticated or anon" on public.game_records;
create policy "records insert authenticated or anon"
on public.game_records for insert
with check (true);

drop policy if exists "records readable by owner or admin" on public.game_records;
create policy "records readable by owner or admin"
on public.game_records for select
using (
  user_id = auth.uid()
  or user_id is null
  or public.is_admin()
);

drop policy if exists "records admin delete" on public.game_records;
create policy "records admin delete"
on public.game_records for delete
using (public.is_admin());

drop policy if exists "online rooms readable by everyone" on public.online_rooms;
create policy "online rooms readable by everyone"
on public.online_rooms for select
using (true);

drop policy if exists "online rooms insert by everyone" on public.online_rooms;
create policy "online rooms insert by everyone"
on public.online_rooms for insert
with check (true);

drop policy if exists "online rooms update by everyone" on public.online_rooms;
create policy "online rooms update by everyone"
on public.online_rooms for update
using (true);

-- After running this schema, set the first admin manually if needed:
-- update public.profiles set role = 'admin' where lower(email) = lower('your-admin@example.com');
