-- Default inventory catalog items start at ₹0 / stock 0 until the owner sets them.
update public.inventory_items
set price = 0, stock = 0
where name in (
  'Badminton Racket',
  'Shuttlecock (Plastic)',
  'Water Bottle (500ml)',
  'Energy Drink'
);
