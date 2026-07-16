-- Dummy data for the simplified product model (name, size, category) + racks.
-- Re-runnable. Populates staff and products, then drives stock_in through the
-- trigger so product_racks and products.quantity stay consistent.
--
-- NOTE: run AFTER 20260716020000_simplify_products.sql has been applied.

begin;

-- Staff roster
insert into public.staff (name) values
  ('Riya'), ('Arjun'), ('Meena')
on conflict (name) do nothing;

-- Products: name (colour/print), size (inches), category (type)
insert into public.products (name, size, category, updated_by) values
  ('Sand',  '5', 'Blackout', 'Riya'),
  ('Ivory', '6', 'Sheer',    'Riya'),
  ('Moss',  '7', 'Designer', 'Riya'),
  ('Stone', '8', 'Plain',    'Riya')
on conflict (name, size, category) do nothing;

-- Opening stock via stock_in (guards prevent double-loading on re-run).

-- Sand 5in Blackout: A-01 x5, C-03 x3
insert into public.stock_transactions (product_id, movement_type, quantity, rack_number, updated_by)
select p.id, 'stock_in', 5, 'A-01', 'Riya'
  from public.products p
 where p.name = 'Sand' and p.size = '5' and p.category = 'Blackout'
   and not exists (select 1 from public.product_racks pr where pr.product_id = p.id);

insert into public.stock_transactions (product_id, movement_type, quantity, rack_number, updated_by)
select p.id, 'stock_in', 3, 'C-03', 'Riya'
  from public.products p
 where p.name = 'Sand' and p.size = '5' and p.category = 'Blackout'
   and not exists (select 1 from public.product_racks pr where pr.product_id = p.id and pr.rack_number = 'C-03')
   and exists (select 1 from public.product_racks pr where pr.product_id = p.id and pr.rack_number = 'A-01');

-- Ivory 6in Sheer: B-04 x42
insert into public.stock_transactions (product_id, movement_type, quantity, rack_number, updated_by)
select p.id, 'stock_in', 42, 'B-04', 'Arjun'
  from public.products p
 where p.name = 'Ivory' and p.size = '6' and p.category = 'Sheer'
   and not exists (select 1 from public.product_racks pr where pr.product_id = p.id);

-- Moss 7in Designer: C-02 x6
insert into public.stock_transactions (product_id, movement_type, quantity, rack_number, updated_by)
select p.id, 'stock_in', 6, 'C-02', 'Riya'
  from public.products p
 where p.name = 'Moss' and p.size = '7' and p.category = 'Designer'
   and not exists (select 1 from public.product_racks pr where pr.product_id = p.id);

-- Stone 8in Plain: A-05 x20, D-01 x11
insert into public.stock_transactions (product_id, movement_type, quantity, rack_number, updated_by)
select p.id, 'stock_in', 20, 'A-05', 'Arjun'
  from public.products p
 where p.name = 'Stone' and p.size = '8' and p.category = 'Plain'
   and not exists (select 1 from public.product_racks pr where pr.product_id = p.id);

insert into public.stock_transactions (product_id, movement_type, quantity, rack_number, updated_by)
select p.id, 'stock_in', 11, 'D-01', 'Arjun'
  from public.products p
 where p.name = 'Stone' and p.size = '8' and p.category = 'Plain'
   and not exists (select 1 from public.product_racks pr where pr.product_id = p.id and pr.rack_number = 'D-01')
   and exists (select 1 from public.product_racks pr where pr.product_id = p.id and pr.rack_number = 'A-05');

commit;
