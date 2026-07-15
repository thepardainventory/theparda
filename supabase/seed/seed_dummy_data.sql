-- Dummy data for the multi-rack + staff model. Re-runnable.
-- Populates staff, products, and drives stock_in/stock_out through the trigger
-- so product_racks and products.quantity stay consistent.
--
-- NOTE: run AFTER 20260716010000_multi_rack_and_staff.sql has been applied.

begin;

------------------------------------------------------------------------------
-- Staff roster
------------------------------------------------------------------------------
insert into public.staff (name) values
  ('Riya'),
  ('Arjun'),
  ('Meena')
on conflict (name) do nothing;

------------------------------------------------------------------------------
-- Products
------------------------------------------------------------------------------
insert into public.products (name, sku, category, color, minimum_stock_level, updated_by) values
  ('Velvet Blackout - Sand',   'VBL-SND-001', 'Blackout', 'Sand',  10, 'Riya'),
  ('Linen Sheer - Ivory',      'LSH-IVR-014', 'Sheer',    'Ivory', 12, 'Riya'),
  ('Jacquard Floral - Moss',   'JFL-MOS-022', 'Designer', 'Moss',   8, 'Riya'),
  ('Cotton Duck - Stone',      'CDK-STN-008', 'Plain',    'Stone', 10, 'Riya')
on conflict (sku) do nothing;

------------------------------------------------------------------------------
-- Opening stock via stock_in transactions.
-- Only insert opening stock if this product currently has no product_racks rows,
-- so re-running the seed does not double-load.
------------------------------------------------------------------------------

-- VBL-SND-001: A-01 x5, C-03 x3  (total 8, below min 10 -> low stock)
insert into public.stock_transactions (product_id, movement_type, quantity, rack_number, updated_by, remarks)
select p.id, 'stock_in', 5, 'A-01', 'Riya', 'Opening stock'
  from public.products p
 where p.sku = 'VBL-SND-001'
   and not exists (select 1 from public.product_racks pr where pr.product_id = p.id);

insert into public.stock_transactions (product_id, movement_type, quantity, rack_number, updated_by, remarks)
select p.id, 'stock_in', 3, 'C-03', 'Riya', 'Opening stock'
  from public.products p
 where p.sku = 'VBL-SND-001'
   and not exists (
     select 1 from public.product_racks pr
      where pr.product_id = p.id and pr.rack_number = 'C-03'
   )
   and exists (
     -- ensure the first opening insert has run this session
     select 1 from public.product_racks pr
      where pr.product_id = p.id and pr.rack_number = 'A-01'
   );

-- LSH-IVR-014: B-04 x42
insert into public.stock_transactions (product_id, movement_type, quantity, rack_number, updated_by, remarks)
select p.id, 'stock_in', 42, 'B-04', 'Arjun', 'Opening stock'
  from public.products p
 where p.sku = 'LSH-IVR-014'
   and not exists (select 1 from public.product_racks pr where pr.product_id = p.id);

-- JFL-MOS-022: C-02 x6  (below min 8 -> low stock)
insert into public.stock_transactions (product_id, movement_type, quantity, rack_number, updated_by, remarks)
select p.id, 'stock_in', 6, 'C-02', 'Riya', 'Opening stock'
  from public.products p
 where p.sku = 'JFL-MOS-022'
   and not exists (select 1 from public.product_racks pr where pr.product_id = p.id);

-- CDK-STN-008: A-05 x20, D-01 x11  (total 31)
insert into public.stock_transactions (product_id, movement_type, quantity, rack_number, updated_by, remarks)
select p.id, 'stock_in', 20, 'A-05', 'Arjun', 'Opening stock'
  from public.products p
 where p.sku = 'CDK-STN-008'
   and not exists (select 1 from public.product_racks pr where pr.product_id = p.id);

insert into public.stock_transactions (product_id, movement_type, quantity, rack_number, updated_by, remarks)
select p.id, 'stock_in', 11, 'D-01', 'Arjun', 'Opening stock'
  from public.products p
 where p.sku = 'CDK-STN-008'
   and not exists (
     select 1 from public.product_racks pr
      where pr.product_id = p.id and pr.rack_number = 'D-01'
   )
   and exists (
     select 1 from public.product_racks pr
      where pr.product_id = p.id and pr.rack_number = 'A-05'
   );

------------------------------------------------------------------------------
-- A little transaction history: one stock_out for realism.
-- Only insert if VBL-SND-001 rack A-01 still has >= 5 (i.e. no prior stock_out yet).
------------------------------------------------------------------------------
insert into public.stock_transactions (product_id, movement_type, quantity, rack_number, updated_by, remarks)
select p.id, 'stock_out', 1, 'A-01', 'Arjun', 'Walk-in customer'
  from public.products p
  join public.product_racks pr
    on pr.product_id = p.id and pr.rack_number = 'A-01'
 where p.sku = 'VBL-SND-001'
   and pr.quantity >= 5;

commit;
