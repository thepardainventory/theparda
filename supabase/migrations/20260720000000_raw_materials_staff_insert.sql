-- Allow staff (not just admins) to add new raw material master rows.
-- Previously only admins could insert into public.raw_materials, mirroring
-- public.products. In practice, day-to-day raw material intake is a staff
-- task, so this brings raw_materials in line with raw_material_transactions
-- (already open to any authenticated user).
--
-- Update and delete on raw_materials remain admin-only.

begin;

drop policy if exists "admins manage raw_materials" on public.raw_materials;

create policy "authenticated add raw_materials" on public.raw_materials
  for insert to authenticated
  with check (true);

commit;
