-- Rollback for 20260723000000_product_delete_cascade.sql
-- Restores the original restrict-on-delete behavior and removes the
-- admin delete policies on product_racks / stock_transactions.
--
-- WARNING: if any product was deleted while this migration was active, its
-- stock_transactions/product_racks rows are gone permanently — this
-- rollback only reverts the schema/policy, it cannot restore deleted data.

begin;

drop policy if exists "admins delete stock_transactions" on public.stock_transactions;
drop policy if exists "admins delete product_racks" on public.product_racks;

alter table public.stock_transactions
  drop constraint stock_transactions_product_id_fkey,
  add constraint stock_transactions_product_id_fkey
    foreign key (product_id) references public.products(id) on delete restrict;

commit;
