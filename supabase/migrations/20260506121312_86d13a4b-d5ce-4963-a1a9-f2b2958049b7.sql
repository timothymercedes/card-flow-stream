create table if not exists public.obs_profiles (
  user_id uuid primary key,
  cf_live_input_id text,
  cf_rtmps_url text,
  cf_stream_key text,
  cf_playback_hls text,
  cf_whip_url text,
  default_title text,
  default_category text,
  default_tcg_tags text[] not null default '{}',
  default_stream_type text not null default 'auction',
  preferred_method text not null default 'obs',
  last_status text,
  last_status_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.obs_profiles enable row level security;

create policy "Owner reads obs profile" on public.obs_profiles
  for select using (auth.uid() = user_id);
create policy "Owner upserts obs profile" on public.obs_profiles
  for insert with check (auth.uid() = user_id);
create policy "Owner updates obs profile" on public.obs_profiles
  for update using (auth.uid() = user_id);
create policy "Admins read obs profiles" on public.obs_profiles
  for select using (has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'owner'::app_role));

create or replace function public.touch_obs_profile() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_touch_obs_profile on public.obs_profiles;
create trigger trg_touch_obs_profile before update on public.obs_profiles
  for each row execute function public.touch_obs_profile();