-- The Parda inventory schema. Run this migration in a new Supabase project.
create type public.app_role as enum ('admin', 'staff');
create type public.movement_type as enum ('stock_in', 'stock_out');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  role public.app_role not null default 'staff',
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  sku text not null unique check (sku = upper(sku) and char_length(trim(sku)) > 0),
  category text not null check (char_length(trim(category)) > 0),
  color text not null check (char_length(trim(color)) > 0),
  quantity integer not null default 0 check (quantity >= 0),
  rack_number text not null check (char_length(trim(rack_number)) > 0),
  minimum_stock_level integer not null default 0 check (minimum_stock_level >= 0),
  notes text,
  updated_at timestamptz not null default now(),
  updated_by text not null,
  created_at timestamptz not null default now()
);

create table public.stock_transactions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  movement_type public.movement_type not null,
  quantity integer not null check (quantity > 0),
  updated_by text not null check (char_length(trim(updated_by)) > 0),
  remarks text,
  created_at timestamptz not null default now()
);

create index products_search_idx on public.products using gin (to_tsvector('simple', name || ' ' || sku || ' ' || category || ' ' || rack_number));
create index stock_transactions_created_at_idx on public.stock_transactions (created_at desc);
create index stock_transactions_product_id_idx on public.stock_transactions (product_id);

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.stock_transactions enable row level security;

create policy "users can read their profile" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "authenticated users can read products" on public.products for select to authenticated using (true);
create policy "admins manage products" on public.products for all to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));
create policy "authenticated users read transactions" on public.stock_transactions for select to authenticated using (true);
create policy "authenticated users add transactions" on public.stock_transactions for insert to authenticated
  with check (exists (select 1 from public.profiles where id = (select auth.uid())));

-- Applies every stock movement atomically. This trigger function has no public execute grant.
create function public.apply_stock_transaction()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  next_quantity integer;
begin
  select display_name into new.updated_by
  from public.profiles
  where id = auth.uid();
  if new.updated_by is null then raise exception 'A profile is required to record stock movements'; end if;

  select quantity + case when new.movement_type = 'stock_in' then new.quantity else -new.quantity end
    into next_quantity
  from public.products
  where id = new.product_id
  for update;

  if next_quantity is null then raise exception 'Product not found'; end if;
  if next_quantity < 0 then raise exception 'Stock cannot become negative'; end if;

  update public.products
  set quantity = next_quantity, updated_at = now(), updated_by = new.updated_by
  where id = new.product_id;
  return new;
end;
$$;
revoke all on function public.apply_stock_transaction() from public;
create trigger apply_stock_after_transaction
after insert on public.stock_transactions
for each row execute function public.apply_stock_transaction();

-- Quantity can only change through the audited stock transaction trigger.
create function public.prevent_direct_stock_change()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.quantity is distinct from old.quantity and pg_trigger_depth() = 1 then
    raise exception 'Use a stock transaction to change quantity';
  end if;
  return new;
end;
$$;
revoke all on function public.prevent_direct_stock_change() from public;
create trigger prevent_direct_stock_change
before update on public.products
for each row execute function public.prevent_direct_stock_change();

grant usage on schema public to authenticated;
grant select on public.products, public.stock_transactions, public.profiles to authenticated;
grant insert on public.stock_transactions to authenticated;
grant insert, update, delete on public.products to authenticated;
