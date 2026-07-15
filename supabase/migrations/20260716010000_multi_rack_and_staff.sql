-- Multi-rack + staff roster migration.
-- Adds public.staff (no-auth roster), public.product_racks (per-rack quantities),
-- moves rack_number from public.products onto public.stock_transactions,
-- and rewires apply_stock_transaction() to maintain per-rack + total quantities
-- using the staff name supplied by the client instead of auth.uid()/profiles.
--
-- The app runs under a single authenticated admin session; "authenticated" == admin here.

begin;

------------------------------------------------------------------------------
-- A) public.staff  (roster only, no auth, no passwords)
------------------------------------------------------------------------------
create table public.staff (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

------------------------------------------------------------------------------
-- B) public.product_racks  (per-rack stock)
------------------------------------------------------------------------------
create table public.product_racks (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  rack_number text not null check (char_length(trim(rack_number)) > 0),
  quantity integer not null default 0 check (quantity >= 0),
  unique (product_id, rack_number)
);

create index product_racks_product_id_idx on public.product_racks (product_id);

------------------------------------------------------------------------------
-- C) stock_transactions.rack_number
--    Table is empty per orchestrator; NOT NULL is safe without a default.
------------------------------------------------------------------------------
alter table public.stock_transactions
  add column rack_number text not null
  check (char_length(trim(rack_number)) > 0);

------------------------------------------------------------------------------
-- D) products: drop rack_number, rebuild GIN search index without it.
--    products.quantity stays; it becomes the maintained sum of product_racks.quantity.
------------------------------------------------------------------------------
drop index if exists public.products_search_idx;
alter table public.products drop column rack_number;
create index products_search_idx
  on public.products
  using gin (to_tsvector('simple', name || ' ' || sku || ' ' || category));

------------------------------------------------------------------------------
-- E) Rewrite apply_stock_transaction()
--    - No more auth.uid()/profiles lookup; updated_by comes from the inserted row.
--    - stock_in: upsert product_racks (product_id, rack_number) += quantity.
--    - stock_out: decrement existing rack row; error if rack missing or would go negative.
--    - Recompute products.quantity = sum(product_racks.quantity) for that product.
------------------------------------------------------------------------------
drop trigger if exists apply_stock_after_transaction on public.stock_transactions;
drop function if exists public.apply_stock_transaction();

create function public.apply_stock_transaction()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  resulting_quantity integer;
begin
  if new.updated_by is null or char_length(trim(new.updated_by)) = 0 then
    raise exception 'A staff name is required to record stock movements';
  end if;

  if new.movement_type = 'stock_in' then
    insert into public.product_racks (product_id, rack_number, quantity)
    values (new.product_id, new.rack_number, new.quantity)
    on conflict (product_id, rack_number)
    do update set quantity = public.product_racks.quantity + excluded.quantity;

  elsif new.movement_type = 'stock_out' then
    update public.product_racks
       set quantity = quantity - new.quantity
     where product_id = new.product_id
       and rack_number = new.rack_number
    returning quantity into resulting_quantity;

    if not found then
      raise exception 'No stock exists on rack % for this product', new.rack_number;
    end if;

    if resulting_quantity < 0 then
      raise exception 'Only the available quantity can be removed from rack %', new.rack_number;
    end if;
  else
    raise exception 'Unsupported movement_type: %', new.movement_type;
  end if;

  update public.products
     set quantity = (
           select coalesce(sum(quantity), 0)
             from public.product_racks
            where product_id = new.product_id
         ),
         updated_at = now(),
         updated_by = new.updated_by
   where id = new.product_id;

  return new;
end;
$$;

revoke all on function public.apply_stock_transaction() from public;

create trigger apply_stock_after_transaction
after insert on public.stock_transactions
for each row execute function public.apply_stock_transaction();

------------------------------------------------------------------------------
-- F) prevent_direct_stock_change() is intentionally left as-is.
--    It blocks products.quantity edits when pg_trigger_depth() = 1 (direct UPDATE).
--    The update inside apply_stock_transaction() runs at pg_trigger_depth() >= 2
--    (it is fired from inside the AFTER INSERT trigger on stock_transactions),
--    so the guard correctly allows the trigger-driven update to proceed.
------------------------------------------------------------------------------

------------------------------------------------------------------------------
-- G) RLS + grants for the new tables.
--    Single-admin model: "authenticated" is always the admin.
------------------------------------------------------------------------------
alter table public.staff enable row level security;
alter table public.product_racks enable row level security;

-- staff: admin-only app, single authenticated principal == admin.
create policy "authenticated manage staff" on public.staff
  for all to authenticated
  using (true)
  with check (true);

-- product_racks: reads allowed to app; writes only via SECURITY DEFINER trigger.
create policy "authenticated read product_racks" on public.product_racks
  for select to authenticated
  using (true);

grant select, insert, update, delete on public.staff to authenticated;
grant select on public.product_racks to authenticated;

commit;
