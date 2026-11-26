#!/usr/bin/env bash
# Isolated check for releasing abandoned holds (throwaway local Postgres only).
set -euo pipefail
unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE
M=drizzle/migrations/0062_seller_commission_vip.sql
D=$(mktemp -d); export PGHOST=$D PGPORT=55433 PGUSER=postgres PGDATABASE=postgres
initdb -D $D/data -U postgres -A trust >/dev/null
pg_ctl -D $D/data -o "-k $D -p 55433 -c listen_addresses=''" -l $D/log start -w >/dev/null
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
q < drizzle/migrations/0063_release_abandoned_commission_holds.sql
S=11111111-1111-1111-1111-111111111111
alloc(){ q -At -c "select prior_sales_cents||' '||commission_cents||' '||new_cumulative_cents from allocate_seller_weekly_commission('$1','$S',$2)"; }
order(){ q -At -c "insert into orders(seller_id,amount) values ('$S',$1) returning id"; }
tr(){ q -At -c "select cumulative_sales_cents/100 from seller_weekly_sales_tracker where seller_id='$S'"; }
age(){ q -c "update seller_commission_allocations set updated_at=now()-interval '31 minutes' where order_id='$1'"; }
echo "== A. Removed from cart =="; o=$(order 300); alloc $o 30000 >/dev/null; echo "held: \$$(tr)"
q -c "delete from orders where id='$o'"; echo "after delete: \$$(tr) ($(q -At -c "select status from seller_commission_allocations where order_id='$o'"))"
echo "== B. Abandoned checkout (31 min old) =="; a=$(order 400); alloc $a 40000 >/dev/null; age $a
b=$(order 200); echo "next \$200 sale: $(alloc $b 20000)  (expect prior 0, commission 1000 = all 5%)"
echo "abandoned hold: $(q -At -c "select status from seller_commission_allocations where order_id='$a'")"
echo "== C. Fresh checkout (under 30 min) still held =="; c=$(order 100); alloc $c 10000 >/dev/null
d=$(order 100); echo "next sale: $(alloc $d 10000) (expect prior 30000)"
echo "== D. Late payment on a released hold =="; q -c "update orders set payment_status='paid', paid_at=now() where id='$a'"
echo "tracker \$$(tr) (expect 800), status $(q -At -c "select status||' '||commission_cents from seller_commission_allocations where order_id='$a'") (original commission kept)"
echo "== E. Expired still releases =="; e=$(order 50); alloc $e 5000 >/dev/null; q -c "update orders set payment_status='expired' where id='$e'"; echo "tracker \$$(tr) (expect 800)"
echo "== F. Paid order deleted is untouched =="; q -c "update orders set payment_status='paid',paid_at=now() where id='$b'"; q -c "delete from orders where id='$b'"; echo "tracker \$$(tr) (expect 800), $(q -At -c "select status from seller_commission_allocations where order_id='$b'")"
echo "== G. 20 simultaneous \$100 sales, fresh seller =="; S=22222222-2222-2222-2222-222222222222
ids=(); for i in $(seq 20); do ids+=($(order 100)); done
for id in "${ids[@]}"; do alloc $id 10000 >/dev/null & done; wait
q -At -c "select count(*) filter (where commission_cents=500)||' at 5%, '||count(*) filter (where commission_cents=800)||' at 8%, total \$'||sum(commission_cents)/100.0 from seller_commission_allocations where seller_id='$S'"
