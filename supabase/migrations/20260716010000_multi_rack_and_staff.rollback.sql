-- Rollback for 20260716010000_multi_rack_and_staff.sql
-- Restores the original schema state defined by 20260716000000_inventory_schema.sql.
--
-- WARNING: rolling back drops public.product_racks and public.staff (and their data),
-- and re-adds products.rack_number as NOT NULL. If any products exist at rollback time,
-- the ALTER TABLE ... ADD COLUMN ... NOT NULL will fail unless every row can be given
-- a value. This rollback assigns rack_number by picking the rack with the highest
-- quantity from product_racks (fallback 'UNKNOWN') BEFORE dropping product_racks.
-- If there are no products, it is a straight reversal.

begin;

------------------------------------------------------------------------------
-- G-reverse) drop policies + grants on new tables
------------------------------------------------------------------------------
drop policy if exists "authenticated read product_racks" on public.product_racks;
drop policy if exists "authenticated manage staff" on public.staff;

revoke select on public.product_racks from authenticated;
revoke select, insert, update, delete on public.staff from authenticated;

------------------------------------------------------------------------------
-- E-reverse) drop the new trigger + function, restore the original.
------------------------------------------------------------------------------
drop trigger if exists apply_stock_after_transaction on public.stock_transactions;
drop function if exists public.apply_stock_transaction();

create function public.apply_stock_transaction()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  next_quantity integer;
begin
  select display_name into new.updated_by
  from public.profiles
  where id = auth.uid();
  if new.updated_by is null then raise exception 'A profile is required to record stock movements'; end if;

  select quantity + case when new.movement_type = 'stock_in' then new.quantity else -new.quantity end
    into next_quantity
  from public.products
  where id = new.product_id
  for update;

  if next_quantity is null then raise exception 'Product not found'; end if;
  if next_quantity < 0 then raise exception 'Stock cannot become negative'; end if;

  update public.products
  set quantity = next_quantity, updated_at = now(), updated_by = new.updated_by
  where id = new.product_id;
  return new;
end;
$$;
revoke all on function public.apply_stock_transaction() from public;
create trigger apply_stock_after_transaction
after insert on public.stock_transactions
for each row execute function public.apply_stock_transaction();

------------------------------------------------------------------------------
-- D-reverse) restore products.rack_number + original GIN index.
--    Add nullable first, backfill from product_racks (best rack by qty),
--    then set NOT NULL + check constraint.
------------------------------------------------------------------------------
drop index if exists public.products_search_idx;

alter table public.products add column rack_number text;

update public.products p
   set rack_number = coalesce(
     (
       select pr.rack_number
         from public.product_racks pr
        where pr.product_id = p.id
        order by pr.quantity desc, pr.rack_number asc
        limit 1
     ),
     'UNKNOWN'
   );

alter table public.products
  alter column rack_number set not null,
  add constraint products_rack_number_check check (char_length(trim(rack_number)) > 0);

create index products_search_idx
  on public.products
  using gin (to_tsvector('simple', name || ' ' || sku || ' ' || category || ' ' || rack_number));

------------------------------------------------------------------------------
-- C-reverse) drop stock_transactions.rack_number
------------------------------------------------------------------------------
alter table public.stock_transactions drop column rack_number;

------------------------------------------------------------------------------
-- B-reverse) drop product_racks
------------------------------------------------------------------------------
drop table if exists public.product_racks;

------------------------------------------------------------------------------
-- A-reverse) drop staff
------------------------------------------------------------------------------
drop table if exists public.staff;

commit;
