-- Rollback for 20260716020000_simplify_products.sql.
-- Restores sku / color / minimum_stock_level / notes on products and
-- remarks on stock_transactions, and removes the size column + identity.
--
-- NOTE: lossy. sku/color are backfilled with placeholders (the original
-- values are gone); size data is dropped. Snapshot first if it matters.

begin;

-- Undo stock_transactions change.
alter table public.stock_transactions add column if not exists remarks text;

-- Drop the new search index and identity constraint.
drop index if exists public.products_search_idx;
alter table public.products drop constraint if exists products_name_size_category_key;

-- Restore removed columns (nullable/placeholder, then re-enforce sku shape).
alter table public.products add column if not exists color text;
alter table public.products add column if not exists minimum_stock_level integer not null default 0;
alter table public.products add column if not exists notes text;
alter table public.products add column if not exists sku text;

update public.products set color = coalesce(color, 'Unknown') where color is null;
update public.products
  set sku = coalesce(sku, 'SKU-' || upper(substr(replace(id::text, '-', ''), 1, 8)))
  where sku is null;

alter table public.products
  alter column color set not null,
  alter column sku set not null,
  add constraint products_sku_key unique (sku),
  add constraint products_sku_upper_ck check (sku = upper(sku) and char_length(trim(sku)) > 0),
  add constraint products_min_stock_ck check (minimum_stock_level >= 0);

-- Drop the size column and its check.
alter table public.products drop constraint if exists products_size_not_blank;
alter table public.products drop column if exists size;

-- Restore the original GIN search index (name || sku || category).
create index products_search_idx
  on public.products
  using gin (to_tsvector('simple', name || ' ' || sku || ' ' || category));

commit;
