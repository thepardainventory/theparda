-- Rollback for 20260720000000_raw_materials_staff_insert.sql
-- Restores admin-only insert on public.raw_materials.

begin;

drop policy if exists "authenticated add raw_materials" on public.raw_materials;

create policy "admins manage raw_materials" on public.raw_materials
  for insert to authenticated
  with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));

commit;
