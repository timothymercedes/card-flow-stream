#!/usr/bin/env bash
# Isolated commission demo: real allocator SQL from migration 0062 on a throwaway local Postgres.
# Never connects to the shared Lovable Cloud database.
set -euo pipefail
unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE
M=drizzle/migrations/0062_seller_commission_vip.sql
D=$(mktemp -d); export PGHOST=$D PGPORT=55432 PGUSER=postgres PGDATABASE=postgres
initdb -D $D/data -U postgres -A trust >/dev/null
pg_ctl -D $D/data -o "-k $D -p 55432 -c listen_addresses=''" -l $D/log start -w >/dev/null
trap 'pg_ctl -D $D/data stop -m fast >/dev/null' EXIT
q(){ psql -X -q -v ON_ERROR_STOP=1 "$@"; }
q <<'SQL'
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'select null::uuid';
CREATE FUNCTION public.has_role(uuid,text) RETURNS boolean LANGUAGE sql AS 'select false';
CREATE TABLE public.listings(id uuid primary key, channel text);
CREATE TABLE public.orders(id uuid primary key default gen_random_uuid(), seller_id uuid, listing_id uuid,
  amount numeric, shipping_amount numeric default 0, payment_status text default 'awaiting_payment',
  paid_at timestamptz, refunded_at timestamptz, status text default 'pending');
SQL
{ sed -n 1,36p $M; sed -n 117,185p $M; } | q
S=11111111-1111-1111-1111-111111111111
alloc(){ q -At -c "select prior_sales_cents||' '||commission_cents||' '||new_cumulative_cents from allocate_seller_weekly_commission('$1','$S',$2)"; }
order(){ q -At -c "insert into orders(seller_id,amount) values ('$S',$1) returning id"; }
echo "== 1. Tiers + seller net (5% first \$500, 8% above) =="
for amt in 300 300 100; do o=$(order $amt); r=($(alloc $o $((amt*100)))); \
  echo "sale \$$amt  prior \$$((r[0]/100))  commission \$$(printf %.2f $(echo "${r[1]}/100"|bc -l))  seller net \$$(printf %.2f $(echo "($amt*100-${r[1]})/100"|bc -l))  week total \$$((r[2]/100))"; done
echo "== 2. Retry / duplicate webhook on the same order =="
r1=$(alloc $o 10000); r2=$(alloc $o 10000)
echo "retry 1 -> $r1 | retry 2 -> $r2 | tracker \$$(( $(q -At -c "select cumulative_sales_cents from seller_weekly_sales_tracker") /100 )) (unchanged)"
echo "== 3. Unpaid/failed checkout releases its reservation =="
o=$(order 200); alloc $o 20000 >/dev/null; q -c "update orders set payment_status='expired' where id='$o'"
echo "after expiry: tracker \$$(( $(q -At -c "select cumulative_sales_cents from seller_weekly_sales_tracker") /100 )), allocation $(q -At -c "select status from seller_commission_allocations where order_id='$o'")"
o=$(order 50); alloc $o 5000 >/dev/null; q -c "update orders set payment_status='paid', paid_at=now() where id='$o'"
echo "paid order allocation: $(q -At -c "select status from seller_commission_allocations where order_id='$o'")"
echo "== 4. Concurrency: 20 simultaneous \$100 sales for a fresh seller =="
S=22222222-2222-2222-2222-222222222222
ids=(); for i in $(seq 20); do ids+=($(order 100)); done
for id in "${ids[@]}"; do alloc $id 10000 >/dev/null & done; wait
q -c "select count(*) orders, sum(commission_cents)/100.0 total_commission, count(*) filter (where commission_cents=500) at_5pct, count(*) filter (where commission_cents=800) at_8pct, max(prior_sales_cents+sale_cents)/100 final_week_total from seller_commission_allocations where seller_id='$S'"
echo "expected: 5 at 5% (\$500 base), 15 at 8%, total \$145.00"
