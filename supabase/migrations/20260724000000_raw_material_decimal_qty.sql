-- Allow fractional meter amounts for raw materials (e.g. 104.235), not just
-- whole numbers. Widens raw_materials.quantity and
-- raw_material_transactions.quantity from integer to numeric(12,3), and
-- relaxes the length_inches format check to accept an optional decimal part.

begin;

alter table public.raw_materials
  alter column quantity type numeric(12,3) using quantity::numeric(12,3);

alter table public.raw_materials
  drop constraint if exists raw_materials_length_inches_check,
  add constraint raw_materials_length_inches_check
    check (length_inches ~ '^[0-9]+(\.[0-9]+)?$');

alter table public.raw_material_transactions
  alter column quantity type numeric(12,3) using quantity::numeric(12,3);

create or replace function public.apply_raw_material_transaction()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  resulting_quantity numeric(12,3);
begin
  if new.updated_by is null or char_length(trim(new.updated_by)) = 0 then
    raise exception 'A staff name is required to record a raw material movement';
  end if;

  if new.movement_type = 'stock_in' then
    update public.raw_materials
       set quantity = quantity + new.quantity,
           updated_at = now(),
           updated_by = new.updated_by
     where id = new.raw_material_id
    returning quantity into resulting_quantity;

  elsif new.movement_type = 'stock_out' then
    update public.raw_materials
       set quantity = quantity - new.quantity,
           updated_at = now(),
           updated_by = new.updated_by
     where id = new.raw_material_id
    returning quantity into resulting_quantity;

    if resulting_quantity < 0 then
      raise exception 'Only the available raw material quantity can be removed';
    end if;
  else
    raise exception 'Unsupported movement_type: %', new.movement_type;
  end if;

  if resulting_quantity is null then
    raise exception 'Raw material not found';
  end if;

  return new;
end;
$$;

revoke all on function public.apply_raw_material_transaction() from public;

commit;
