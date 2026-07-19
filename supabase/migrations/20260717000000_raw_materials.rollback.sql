-- Rollback for 20260717000000_raw_materials.sql
-- Drops the Raw Material Detail module entirely. Destructive to any data in
-- raw_materials / raw_material_transactions — snapshot first if that data matters.

begin;

drop trigger if exists prevent_raw_material_direct_stock_change on public.raw_materials;
drop trigger if exists apply_raw_material_after_transaction on public.raw_material_transactions;
drop function if exists public.apply_raw_material_transaction();

drop table if exists public.raw_material_transactions;
drop table if exists public.raw_materials;

commit;
