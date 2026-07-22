-- One-off cleanup: remove all the placeholder/dummy inventory data
-- (Sand/Ivory/Moss/Stone products, their racks and stock movements, and the
-- dummy raw materials) so testing can start from a clean slate against the
-- real PRODUCT/SIZE/TYPE catalog.
--
-- Run this in the Supabase SQL editor (it runs as the table owner, so it
-- bypasses RLS — the app's staff/owner logins cannot run this themselves).
-- Does NOT touch public.staff or public.profiles / auth.users.

begin;

delete from public.raw_material_transactions;
delete from public.raw_materials;
delete from public.stock_transactions;
delete from public.product_racks;
delete from public.products;

commit;
