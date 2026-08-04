-- One-off data correction: recompute products.quantity from the real
-- product_racks rows for every product.
--
-- Root cause: products.quantity used to be a directly-maintained column
-- (single rack per product) before 20260716010000_multi_rack_and_staff.sql
-- introduced product_racks and rewired stock movements to upsert/decrement
-- rack rows and recompute products.quantity as sum(product_racks.quantity).
-- That migration never backfilled product_racks for products that already
-- existed at the time, so those products kept their old quantity value
-- forever with no product_racks row to back it — e.g. "AMBER WAVE / 9 feet /
-- SR" shows quantity 2 with no rack in All Products / Export Data, while the
-- Dashboard (which reads product_racks directly) correctly shows 0.
--
-- Every product created after that migration is unaffected — its quantity
-- is always kept in sync by the apply_stock_transaction() trigger.
--
-- Run this whole file in one go in the Supabase SQL editor (it runs as the
-- table owner, so it bypasses RLS and the prevent_direct_stock_change guard
-- that normally blocks direct quantity edits). The last query's result is
-- the proof: it must show 0 for both remaining_mismatches and
-- amber_wave_9_sr_quantity.

begin;

alter table public.products disable trigger prevent_direct_stock_change;

update public.products p
   set quantity = sub.real_quantity
  from (
    select p2.id, coalesce(sum(pr.quantity), 0) as real_quantity
      from public.products p2
      left join public.product_racks pr on pr.product_id = p2.id
     group by p2.id
  ) sub
 where p.id = sub.id
   and p.quantity <> sub.real_quantity;

alter table public.products enable trigger prevent_direct_stock_change;

commit;

-- Proof of success: run this as part of the same script.
-- remaining_mismatches must be 0, and amber_wave_9_sr_quantity must be 0.
select
  (select count(*) from (
     select p.id, p.quantity, coalesce(sum(pr.quantity), 0) as real_quantity
       from public.products p
       left join public.product_racks pr on pr.product_id = p.id
      group by p.id, p.quantity
   ) t
   where t.quantity <> t.real_quantity) as remaining_mismatches,
  (select quantity from public.products
    where name = 'AMBER WAVE' and size = '9' and category = 'SR') as amber_wave_9_sr_quantity;
