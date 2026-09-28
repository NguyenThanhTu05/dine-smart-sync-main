
DO $$
DECLARE c_kv UUID; c_main UUID; c_drink UUID;
BEGIN
  -- ensure categories
  SELECT id INTO c_kv FROM public.categories WHERE name='Khai vị' LIMIT 1;
  IF c_kv IS NULL THEN INSERT INTO public.categories(name, sort_order) VALUES ('Khai vị', 1) RETURNING id INTO c_kv; END IF;

  SELECT id INTO c_main FROM public.categories WHERE name='Món chính' LIMIT 1;
  IF c_main IS NULL THEN INSERT INTO public.categories(name, sort_order) VALUES ('Món chính', 2) RETURNING id INTO c_main; END IF;

  SELECT id INTO c_drink FROM public.categories WHERE name='Đồ uống' LIMIT 1;
  IF c_drink IS NULL THEN INSERT INTO public.categories(name, sort_order) VALUES ('Đồ uống', 3) RETURNING id INTO c_drink; END IF;

  -- update existing items with images
  UPDATE public.menu_items SET image_url='https://tlpqdeijtbttnejwlntq.supabase.co/storage/v1/object/public/images/demo/khan-lanh.jpg' WHERE name='Khăn lạnh' AND (image_url IS NULL OR image_url='');
  UPDATE public.menu_items SET image_url='https://tlpqdeijtbttnejwlntq.supabase.co/storage/v1/object/public/images/demo/lac-rang.jpg' WHERE name='Lạc rang' AND (image_url IS NULL OR image_url='');
  UPDATE public.menu_items SET image_url='https://tlpqdeijtbttnejwlntq.supabase.co/storage/v1/object/public/images/demo/bo-xao.jpg' WHERE name='Bò xào' AND (image_url IS NULL OR image_url='');
  UPDATE public.menu_items SET image_url='https://tlpqdeijtbttnejwlntq.supabase.co/storage/v1/object/public/images/demo/ga-nuong.jpg' WHERE name='Gà nướng' AND (image_url IS NULL OR image_url='');

  -- add new demo items if missing
  INSERT INTO public.menu_items(category_id, name, price, is_default, image_url)
  SELECT c_main, 'Phở bò', 65000, FALSE, 'https://tlpqdeijtbttnejwlntq.supabase.co/storage/v1/object/public/images/demo/pho-bo.jpg'
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE name='Phở bò');

  INSERT INTO public.menu_items(category_id, name, price, is_default, image_url)
  SELECT c_kv, 'Nem rán', 50000, FALSE, 'https://tlpqdeijtbttnejwlntq.supabase.co/storage/v1/object/public/images/demo/nem-ran.jpg'
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE name='Nem rán');

  INSERT INTO public.menu_items(category_id, name, price, is_default, image_url)
  SELECT c_drink, 'Trà chanh', 20000, FALSE, 'https://tlpqdeijtbttnejwlntq.supabase.co/storage/v1/object/public/images/demo/tra-chanh.jpg'
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE name='Trà chanh');

  INSERT INTO public.menu_items(category_id, name, price, is_default, image_url)
  SELECT c_drink, 'Bia', 25000, FALSE, 'https://tlpqdeijtbttnejwlntq.supabase.co/storage/v1/object/public/images/demo/bia.jpg'
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE name='Bia');
END $$;
