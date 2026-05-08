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
  player_mode text not null check (player_mode in ('ai', 'local')),
  opening_name text,
  winner text,
  reason text,
  moves jsonb not null default '[]'::jsonb,
  duration_seconds int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.openings (
  id text primary key,
  name text not null,
  family text not null check (family in ('direct', 'diagonal')),
  black1 jsonb not null,
  white2 jsonb not null,
  black3 jsonb not null,
  created_at timestamptz not null default now()
);

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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.game_records enable row level security;
alter table public.openings enable row level security;

drop policy if exists "profiles readable by owner or admin" on public.profiles;
create policy "profiles readable by owner or admin"
on public.profiles for select
using (
  auth.uid() = id
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
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
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

drop policy if exists "records admin delete" on public.game_records;
create policy "records admin delete"
on public.game_records for delete
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "openings readable by everyone" on public.openings;
create policy "openings readable by everyone"
on public.openings for select
using (true);

insert into public.openings (id, name, family, black1, white2, black3)
values
('direct-1','直指 寒星','direct','{"row":7,"col":7}','{"row":6,"col":7}','{"row":5,"col":7}'),
('direct-2','直指 溪月','direct','{"row":7,"col":7}','{"row":6,"col":7}','{"row":5,"col":8}'),
('direct-3','直指 疏星','direct','{"row":7,"col":7}','{"row":6,"col":7}','{"row":5,"col":9}'),
('direct-4','直指 花月','direct','{"row":7,"col":7}','{"row":6,"col":7}','{"row":6,"col":5}'),
('direct-5','直指 残月','direct','{"row":7,"col":7}','{"row":6,"col":7}','{"row":6,"col":6}'),
('direct-6','直指 雨月','direct','{"row":7,"col":7}','{"row":6,"col":7}','{"row":6,"col":8}'),
('direct-7','直指 金星','direct','{"row":7,"col":7}','{"row":6,"col":7}','{"row":6,"col":9}'),
('direct-8','直指 松月','direct','{"row":7,"col":7}','{"row":6,"col":7}','{"row":7,"col":8}'),
('direct-9','直指 丘月','direct','{"row":7,"col":7}','{"row":6,"col":7}','{"row":7,"col":9}'),
('direct-10','直指 新月','direct','{"row":7,"col":7}','{"row":6,"col":7}','{"row":8,"col":7}'),
('direct-11','直指 瑞星','direct','{"row":7,"col":7}','{"row":6,"col":7}','{"row":8,"col":8}'),
('direct-12','直指 山月','direct','{"row":7,"col":7}','{"row":6,"col":7}','{"row":8,"col":9}'),
('direct-13','直指 游星','direct','{"row":7,"col":7}','{"row":6,"col":7}','{"row":9,"col":7}'),
('diagonal-1','斜指 长星','diagonal','{"row":7,"col":7}','{"row":6,"col":6}','{"row":5,"col":5}'),
('diagonal-2','斜指 峡月','diagonal','{"row":7,"col":7}','{"row":6,"col":6}','{"row":5,"col":6}'),
('diagonal-3','斜指 恒星','diagonal','{"row":7,"col":7}','{"row":6,"col":6}','{"row":6,"col":5}'),
('diagonal-4','斜指 水月','diagonal','{"row":7,"col":7}','{"row":6,"col":6}','{"row":5,"col":7}'),
('diagonal-5','斜指 流星','diagonal','{"row":7,"col":7}','{"row":6,"col":6}','{"row":7,"col":5}'),
('diagonal-6','斜指 云月','diagonal','{"row":7,"col":7}','{"row":6,"col":6}','{"row":6,"col":8}'),
('diagonal-7','斜指 浦月','diagonal','{"row":7,"col":7}','{"row":6,"col":6}','{"row":5,"col":9}'),
('diagonal-8','斜指 岚月','diagonal','{"row":7,"col":7}','{"row":6,"col":6}','{"row":8,"col":5}'),
('diagonal-9','斜指 银月','diagonal','{"row":7,"col":7}','{"row":6,"col":6}','{"row":8,"col":6}'),
('diagonal-10','斜指 明星','diagonal','{"row":7,"col":7}','{"row":6,"col":6}','{"row":8,"col":8}'),
('diagonal-11','斜指 斜月','diagonal','{"row":7,"col":7}','{"row":6,"col":6}','{"row":8,"col":9}'),
('diagonal-12','斜指 名月','diagonal','{"row":7,"col":7}','{"row":6,"col":6}','{"row":9,"col":5}'),
('diagonal-13','斜指 彗星','diagonal','{"row":7,"col":7}','{"row":6,"col":6}','{"row":9,"col":9}')
on conflict (id) do nothing;

-- After running this schema, set the first admin manually if needed:
-- update public.profiles set role = 'admin' where lower(email) = lower('your-admin@example.com');
