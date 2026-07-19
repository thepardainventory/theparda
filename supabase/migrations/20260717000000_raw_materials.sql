-- Raw Material Detail module.
-- One raw_materials row per distinct product NAME (not per size/category variant).
-- Reuses the existing public.movement_type enum and the generic
-- prevent_direct_stock_change() trigger function (both defined in earlier migrations).

begin;

------------------------------------------------------------------------------
-- A) public.raw_materials  (master row per distinct product name)
------------------------------------------------------------------------------
create table public.raw_materials (
  id uuid primary key default gen_random_uuid(),
  product_name text not null unique check (char_length(trim(product_name)) > 0),
  length_inches text not null check (length_inches ~ '^[0-9]+$'),
  quantity integer not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  updated_by text not null,
  created_at timestamptz not null default now()
);

------------------------------------------------------------------------------
-- B) public.raw_material_transactions  (audit trail, mirrors stock_transactions)
------------------------------------------------------------------------------
create table public.raw_material_transactions (
  id uuid primary key default gen_random_uuid(),
  raw_material_id uuid not null references public.raw_materials(id) on delete restrict,
  movement_type public.movement_type not null,
  quantity integer not null check (quantity > 0),
  updated_by text not null check (char_length(trim(updated_by)) > 0),
  created_at timestamptz not null default now()
);

create index raw_material_transactions_raw_material_id_idx
  on public.raw_material_transactions (raw_material_id);
create index raw_material_transactions_created_at_idx
  on public.raw_material_transactions (created_at desc);

------------------------------------------------------------------------------
-- C) Trigger: applying a raw_material_transaction adjusts raw_materials.quantity
--    Mirrors apply_stock_transaction() but with no rack dimension.
------------------------------------------------------------------------------
create function public.apply_raw_material_transaction()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  resulting_quantity integer;
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

create trigger apply_raw_material_after_transaction
after insert on public.raw_material_transactions
for each row execute function public.apply_raw_material_transaction();

------------------------------------------------------------------------------
-- D) Reuse the existing generic prevent_direct_stock_change() guard.
--    It only inspects NEW/OLD.quantity and pg_trigger_depth(), so it applies
--    unchanged to any table with a quantity column.
------------------------------------------------------------------------------
create trigger prevent_raw_material_direct_stock_change
before update on public.raw_materials
for each row execute function public.prevent_direct_stock_change();

------------------------------------------------------------------------------
-- E) RLS + grants.
--    Single-admin-owner model: the owner (admin profile) manages the raw
--    material master rows (create/rename/relength); any authenticated
--    session (owner or anonymous staff) can read and record stock in/out.
------------------------------------------------------------------------------
alter table public.raw_materials enable row level security;
alter table public.raw_material_transactions enable row level security;

create policy "authenticated read raw_materials" on public.raw_materials
  for select to authenticated using (true);

create policy "admins manage raw_materials" on public.raw_materials
  for insert to authenticated
  with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));

create policy "admins update raw_materials" on public.raw_materials
  for update to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));

create policy "admins delete raw_materials" on public.raw_materials
  for delete to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));

create policy "authenticated read raw_material_transactions" on public.raw_material_transactions
  for select to authenticated using (true);

create policy "authenticated add raw_material_transactions" on public.raw_material_transactions
  for insert to authenticated with check (true);

grant select on public.raw_materials to authenticated;
grant insert, update, delete on public.raw_materials to authenticated;
grant select, insert on public.raw_material_transactions to authenticated;

commit;
