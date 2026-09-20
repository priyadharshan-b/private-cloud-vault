-- Run this in the Supabase SQL editor before using Private Cloud.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  full_name text,
  avatar_url text,
  passcode_hash text,
  passcode_created_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  parent_folder_id uuid references public.folders(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid references public.folders(id) on delete set null,
  name text not null,
  original_name text not null,
  storage_path text not null unique,
  mime_type text not null default 'application/octet-stream',
  file_size bigint not null check (file_size >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_user_id_idx on public.profiles(id);
create index if not exists folders_user_id_idx on public.folders(user_id);
create index if not exists files_user_id_updated_at_idx on public.files(user_id, updated_at desc);
create index if not exists files_user_id_name_idx on public.files(user_id, name);

alter table public.profiles enable row level security;
alter table public.folders enable row level security;
alter table public.files enable row level security;

drop policy if exists "profiles own row" on public.profiles;
create policy "profiles own row" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "folders own rows" on public.folders;
create policy "folders own rows" on public.folders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "files own rows" on public.files;
create policy "files own rows" on public.files
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture')
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, profiles.avatar_url),
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Create a private bucket named user-files in Storage.
-- Apply the following Storage policies after creating it:
drop policy if exists "user-files read own objects" on storage.objects;
create policy "user-files read own objects" on storage.objects
  for select to authenticated
  using (bucket_id = 'user-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "user-files insert own objects" on storage.objects;
create policy "user-files insert own objects" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'user-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "user-files update own objects" on storage.objects;
create policy "user-files update own objects" on storage.objects
  for update to authenticated
  using (bucket_id = 'user-files' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'user-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "user-files delete own objects" on storage.objects;
create policy "user-files delete own objects" on storage.objects
  for delete to authenticated
  using (bucket_id = 'user-files' and (storage.foldername(name))[1] = auth.uid()::text);