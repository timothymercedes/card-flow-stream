create table if not exists public.auction_queue (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid not null references public.live_streams(id) on delete cascade,
  host_id uuid not null,
  position int not null default 0,
  title text not null,
  image_url text,
  starting_bid numeric not null default 1,
  duration_seconds int not null default 30,
  snipe_price numeric,
  reveal_mode text default 'none',
  status text not null default 'queued' check (status in ('queued','running','sold','unsold','skipped')),
  winning_bid numeric,
  winner_id uuid,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists idx_auction_queue_stream_pos on public.auction_queue(stream_id, position);
create index if not exists idx_auction_queue_status on public.auction_queue(stream_id, status);

alter table public.auction_queue enable row level security;

create policy "queue viewable by anyone"
  on public.auction_queue for select using (true);

create policy "host can insert queue items"
  on public.auction_queue for insert
  with check (auth.uid() = host_id);

create policy "host can update queue items"
  on public.auction_queue for update
  using (auth.uid() = host_id);

create policy "host can delete queue items"
  on public.auction_queue for delete
  using (auth.uid() = host_id);

alter publication supabase_realtime add table public.auction_queue;