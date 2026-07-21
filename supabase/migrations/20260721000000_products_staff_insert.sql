-- Allow staff (not just admins) to create new products.
-- Needed so the Update Returned Stock page can auto-create a product when a
-- returned item's Name+Size+Type combo doesn't exist yet, regardless of who
-- is signed in. Previously "admins manage products" covered insert/update/
-- delete as a single admin-only policy; split it so insert opens up to any
-- authenticated user while update/delete remain admin-only.

begin;

drop policy if exists "admins manage products" on public.products;

create policy "authenticated add products" on public.products
  for insert to authenticated
  with check (true);

create policy "admins update products" on public.products
  for update to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));

create policy "admins delete products" on public.products
  for delete to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));

commit;
