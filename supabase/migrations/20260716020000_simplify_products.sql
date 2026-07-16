-- Simplify the product model to: name, size, category (type), quantity (total).
-- Drops sku / color / minimum_stock_level / notes from products, adds size,
-- makes (name, size, category) the product identity, and drops
-- stock_transactions.remarks. Per-rack quantities remain in product_racks.

begin;

-- Drop the old search index (references sku) and the sku unique constraint.
drop index if exists public.products_search_idx;
alter table public.products drop constraint if exists products_sku_key;

-- Add "size" (nullable first so existing rows pass, backfill, then enforce).
alter table public.products add column if not exists size text;
update public.products set size = 'Standard' where size is null;
alter table public.products
  alter column size set not null,
  add constraint products_size_not_blank check (char_length(trim(size)) > 0);

-- Remove the fields we no longer use.
alter table public.products
  drop column if exists color,
  drop column if exists minimum_stock_level,
  drop column if exists notes,
  drop column if exists sku;

-- A product is now uniquely identified by (name, size, category).
alter table public.products
  add constraint products_name_size_category_key unique (name, size, category);

-- Rebuild the search index on the remaining text fields.
create index products_search_idx
  on public.products
  using gin (to_tsvector('simple', name || ' ' || size || ' ' || category));

-- Stock updates no longer carry remarks.
alter table public.stock_transactions drop column if exists remarks;

commit;
