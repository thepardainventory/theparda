-- Let deleting a product also remove its stock movement history, instead of
-- being blocked by it. The All Products page now warns the admin up front
-- when a product still has stock or transaction history and asks them to
-- confirm before deleting — this migration is what makes that confirmed
-- delete actually succeed instead of failing with a foreign-key error.
--
-- public.product_racks already cascades on product delete (see
-- 20260716010000_multi_rack_and_staff.sql). stock_transactions currently
-- restricts it; switch it to cascade too. Row-level security still applies
-- to cascade-triggered deletes, so also add admin-only delete policies for
-- both tables (product_racks had none at all before this).

begin;

alter table public.stock_transactions
  drop constraint stock_transactions_product_id_fkey,
  add constraint stock_transactions_product_id_fkey
    foreign key (product_id) references public.products(id) on delete cascade;

create policy "admins delete stock_transactions" on public.stock_transactions
  for delete to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));

create policy "admins delete product_racks" on public.product_racks
  for delete to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));

commit;
