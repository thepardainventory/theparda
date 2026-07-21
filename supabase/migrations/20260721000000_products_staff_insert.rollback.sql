-- Rollback for 20260721000000_products_staff_insert.sql
-- Restores the single admin-only "for all" policy on public.products.

begin;

drop policy if exists "authenticated add products" on public.products;
drop policy if exists "admins update products" on public.products;
drop policy if exists "admins delete products" on public.products;

create policy "admins manage products" on public.products for all to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));

commit;
