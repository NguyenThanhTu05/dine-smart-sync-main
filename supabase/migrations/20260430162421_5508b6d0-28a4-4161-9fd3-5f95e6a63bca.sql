
DO $$
DECLARE
  d INT; orders_today INT; i INT; j INT;
  order_id UUID; tbl_id UUID; mi RECORD;
  num_items INT; qty INT;
  paid_time TIMESTAMPTZ;
BEGIN
  -- Skip if demo orders already exist
  IF EXISTS (SELECT 1 FROM public.orders WHERE notes = 'demo-seed') THEN RETURN; END IF;

  SELECT id INTO tbl_id FROM public.restaurant_tables LIMIT 1;
  IF tbl_id IS NULL THEN RETURN; END IF;

  FOR d IN 0..6 LOOP
    orders_today := 6 + floor(random() * 7)::int;
    FOR i IN 1..orders_today LOOP
      paid_time := (now() - (d || ' days')::interval) - (floor(random() * 12) || ' hours')::interval;
      INSERT INTO public.orders(table_id, is_paid, paid_at, payment_method, total, notes, created_at)
      VALUES (tbl_id, TRUE, paid_time, (CASE WHEN random() < 0.6 THEN 'cash' ELSE 'qr' END)::payment_method, 0, 'demo-seed', paid_time)
      RETURNING id INTO order_id;

      num_items := 2 + floor(random() * 4)::int;
      FOR j IN 1..num_items LOOP
        SELECT id, name, price INTO mi FROM public.menu_items ORDER BY random() LIMIT 1;
        qty := 1 + floor(random() * 3)::int;
        INSERT INTO public.order_items(order_id, menu_item_id, name_snapshot, price_snapshot, quantity, status, created_at)
        VALUES (order_id, mi.id, mi.name, mi.price, qty, 'served', paid_time);
      END LOOP;
    END LOOP;
  END LOOP;
END $$;
