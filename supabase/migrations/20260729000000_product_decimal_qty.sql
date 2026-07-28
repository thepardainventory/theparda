-- Allow fractional quantities for product stock (e.g. 1.5), matching what
-- raw materials already support, instead of whole numbers only.
-- Widens products.quantity, product_racks.quantity, and
-- stock_transactions.quantity from integer to numeric(12,3).

begin;

alter table public.products
  alter column quantity type numeric(12,3) using quantity::numeric(12,3);

alter table public.product_racks
  alter column quantity type numeric(12,3) using quantity::numeric(12,3);

alter table public.stock_transactions
  alter column quantity type numeric(12,3) using quantity::numeric(12,3);

create or replace function public.apply_stock_transaction()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  resulting_quantity numeric(12,3);
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

commit;
