-- LOCAL REVIEW ONLY. No type conversion, legacy rewrite or constraint scan.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SELECT pg_advisory_xact_lock(20261009,1);
CREATE OR REPLACE FUNCTION public.restaurant_recipe(p_action text,p_menu uuid,p_rows jsonb,p_expected jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE line jsonb; qty numeric; current_rows jsonb; ingredient uuid;
BEGIN
 PERFORM restaurant_private.require_role(ARRAY['admin']); PERFORM pg_advisory_xact_lock(20261009,1);
 IF NOT EXISTS(SELECT 1 FROM public.menu_items WHERE id=p_menu) OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows)>200 THEN RAISE EXCEPTION 'Công thức không hợp lệ.'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('ingredient_id',ingredient_id,'quantity',quantity) ORDER BY ingredient_id),'[]'::jsonb)
 INTO current_rows FROM public.recipes WHERE menu_item_id=p_menu;
 IF p_expected IS NULL OR current_rows<>p_expected THEN RAISE EXCEPTION 'Định mức vừa thay đổi. Tải lại trước khi lưu.' USING ERRCODE='40001'; END IF;
 IF p_action IS NULL OR p_action NOT IN ('add','update','delete','replace') OR (p_action<>'replace' AND jsonb_array_length(p_rows)<>1) THEN RAISE EXCEPTION 'Thao tác định mức không hợp lệ.'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) x GROUP BY x->>'ingredient_id' HAVING count(*)>1) THEN RAISE EXCEPTION 'Nguyên liệu bị lặp trong công thức.'; END IF;
 FOR line IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
  ingredient:=(line->>'ingredient_id')::uuid;
  IF ingredient IS NULL OR NOT EXISTS(SELECT 1 FROM public.ingredients WHERE id=ingredient) THEN RAISE EXCEPTION 'Nguyên liệu không còn tồn tại.'; END IF;
  IF p_action<>'delete' THEN qty:=restaurant_private.decimal_value(line->'quantity','Định mức',3,99999999999.999,true); END IF;
  IF p_action IN ('update','delete') AND NOT EXISTS(SELECT 1 FROM public.recipes WHERE menu_item_id=p_menu AND ingredient_id=ingredient) THEN RAISE EXCEPTION 'Định mức không còn tồn tại.'; END IF;
 END LOOP;
 -- Validate every row before replacement; any later trigger/error rolls back all.
 IF p_action='replace' THEN DELETE FROM public.recipes WHERE menu_item_id=p_menu; END IF;
 FOR line IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
  ingredient:=(line->>'ingredient_id')::uuid;
  IF p_action='delete' THEN DELETE FROM public.recipes WHERE menu_item_id=p_menu AND ingredient_id=ingredient;
  ELSIF p_action='update' THEN UPDATE public.recipes SET quantity=(line->>'quantity')::numeric WHERE menu_item_id=p_menu AND ingredient_id=ingredient;
  ELSE INSERT INTO public.recipes(menu_item_id,ingredient_id,quantity) VALUES(p_menu,ingredient,(line->>'quantity')::numeric);
  END IF;
 END LOOP;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('ingredient_id',ingredient_id,'quantity',quantity) ORDER BY ingredient_id),'[]'::jsonb) FROM public.recipes WHERE menu_item_id=p_menu);
END $$;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.recipes FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.restaurant_recipe(text,uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.restaurant_recipe(text,uuid,jsonb,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.restaurant_menu(p_id uuid,p_data jsonb,p_expected jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE oldrow public.menu_items; merged jsonb; price_value numeric; result jsonb; key text;
BEGIN
 PERFORM restaurant_private.require_role(ARRAY['admin']); PERFORM pg_advisory_xact_lock(20261009,1);
 IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' THEN RAISE EXCEPTION 'Dữ liệu món không hợp lệ.'; END IF;
 FOR key IN SELECT jsonb_object_keys(p_data) LOOP
  IF key NOT IN ('name','price','category_id','is_available','is_default','no_cook','image_url','recipe') THEN RAISE EXCEPTION 'Trường món không được phép: %',key; END IF;
 END LOOP;
 IF p_id IS NULL THEN
  merged:=jsonb_build_object('is_available',true,'is_default',false,'no_cook',false)||p_data;
 ELSE
  SELECT * INTO oldrow FROM public.menu_items WHERE id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Món không còn tồn tại.'; END IF;
  IF p_expected IS NULL OR NOT to_jsonb(oldrow) @> (p_expected-'created_at') THEN RAISE EXCEPTION 'Món vừa thay đổi. Tải lại trước khi lưu.' USING ERRCODE='40001'; END IF;
  merged:=to_jsonb(oldrow)||p_data;
 END IF;
 IF length(btrim(merged->>'name')) NOT BETWEEN 1 AND 200 OR merged->>'name' IS NULL THEN RAISE EXCEPTION 'Tên món không hợp lệ.'; END IF;
 price_value:=restaurant_private.decimal_value(merged->'price','Giá món',2,9999999999.99);
 FOREACH key IN ARRAY ARRAY['is_available','is_default','no_cook'] LOOP
  IF jsonb_typeof(merged->key) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Trạng thái món phải là boolean.'; END IF;
 END LOOP;
 IF length(coalesce(merged->>'recipe',''))>10000 OR length(coalesce(merged->>'image_url',''))>2048 THEN RAISE EXCEPTION 'Ghi chú hoặc URL quá dài.'; END IF;
 IF p_id IS NULL THEN
  INSERT INTO public.menu_items(name,price,category_id,is_available,is_default,no_cook,image_url,recipe)
  VALUES(btrim(merged->>'name'),price_value,(merged->>'category_id')::uuid,(merged->>'is_available')::boolean,(merged->>'is_default')::boolean,(merged->>'no_cook')::boolean,merged->>'image_url',merged->>'recipe') RETURNING to_jsonb(menu_items.*) INTO result;
 ELSE
  UPDATE public.menu_items SET name=btrim(merged->>'name'),price=price_value,category_id=(merged->>'category_id')::uuid,
   is_available=(merged->>'is_available')::boolean,is_default=(merged->>'is_default')::boolean,no_cook=(merged->>'no_cook')::boolean,image_url=merged->>'image_url',recipe=merged->>'recipe'
  WHERE id=p_id RETURNING to_jsonb(menu_items.*) INTO result;
 END IF;
 RETURN result;
END $$;
REVOKE INSERT,UPDATE ON public.menu_items FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.restaurant_menu(uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.restaurant_menu(uuid,jsonb,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION restaurant_private.validate_row() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE data jsonb:=to_jsonb(NEW); previous jsonb; key text; value text;
BEGIN
 IF TG_OP='UPDATE' THEN previous:=to_jsonb(OLD);
 ELSIF TG_TABLE_NAME='profiles' THEN
  -- BEFORE INSERT also runs for ON CONFLICT UPDATE. Preserve unchanged legacy
  -- fields in profile upserts (e.g. avatar-only edits) without bypassing checks
  -- for newly created profiles or fields that actually change.
  SELECT to_jsonb(p) INTO previous FROM public.profiles p WHERE p.id=NEW.id;
 END IF;
 IF TG_TABLE_NAME='order_items' THEN
  IF NEW.no_cook AND NEW.status IN ('pending','cooking') AND
   (TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status OR NEW.no_cook IS DISTINCT FROM OLD.no_cook) THEN
   RAISE EXCEPTION 'Món không chế biến không được chuyển xuống bếp.';
  END IF;
 END IF;
 -- Check changed fields only: invalid legacy fields remain available for review.
 FOR key,value IN SELECT * FROM jsonb_each_text(data) LOOP
  IF previous IS NOT NULL AND (previous->key) IS NOT DISTINCT FROM (data->key) THEN CONTINUE; END IF;
  IF jsonb_typeof(data->key)='string' AND value IS NOT NULL AND (length(value)>10000 OR value ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]') THEN RAISE EXCEPTION 'Trường % quá dài hoặc chứa ký tự điều khiển.',key; END IF;
  IF key IN ('name','full_name','username','unit') AND (value IS NULL OR length(btrim(value)) NOT BETWEEN 1 AND CASE WHEN key='unit' THEN 32 ELSE 200 END) THEN RAISE EXCEPTION 'Trường % không hợp lệ.',key; END IF;
  IF key IN ('name','full_name','username','unit') AND value ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'Trường % chứa ký tự điều khiển.',key; END IF;
  IF key LIKE '%url' AND nullif(btrim(value),'') IS NOT NULL AND (length(value)>2048 OR value !~ '^https?://[^[:space:]]+$') THEN RAISE EXCEPTION 'URL % không hợp lệ.',key; END IF;
  IF key IN ('vat_percent','service_percent','global_discount_percent','discount_percent') AND value IS NOT NULL AND (value::numeric<0 OR value::numeric>100 OR value IN ('NaN','Infinity','-Infinity')) THEN RAISE EXCEPTION 'Phần trăm phải từ 0 đến 100.'; END IF;
  IF key IN ('price','price_snapshot','min_stock') AND (value::numeric<0 OR value IN ('NaN','Infinity','-Infinity')) THEN RAISE EXCEPTION '% phải là số không âm.',key; END IF;
  IF key='stock' AND value IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Tồn kho phải hữu hạn.'; END IF;
  IF key IN ('seats','quantity','radius_m') AND (value::numeric<=0 OR value IN ('NaN','Infinity','-Infinity')) THEN RAISE EXCEPTION '% phải lớn hơn 0.',key; END IF;
  IF key='seats' AND value::numeric>1000 THEN RAISE EXCEPTION 'Số ghế vượt giới hạn.'; END IF;
  IF key='phone' AND nullif(btrim(value),'') IS NOT NULL AND (length(value)>32 OR value !~ '^\+?[0-9 ()\.-]{5,32}$' OR length(regexp_replace(value,'[^0-9]','','g'))<5) THEN RAISE EXCEPTION 'Số điện thoại không hợp lệ.'; END IF;
  IF key='username' AND value !~ '^[A-Za-z0-9_.-]{1,64}$' THEN RAISE EXCEPTION 'Tên đăng nhập không hợp lệ.'; END IF;
  IF key='birthday' AND value::date>(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date THEN RAISE EXCEPTION 'Ngày sinh không được ở tương lai.'; END IF;
  IF key IN ('birthday','hire_date') AND value IN ('infinity','-infinity') THEN RAISE EXCEPTION 'Ngày % phải hữu hạn.',key; END IF;
  IF key='latitude' AND (value::numeric NOT BETWEEN -90 AND 90 OR value IN ('NaN','Infinity','-Infinity')) THEN RAISE EXCEPTION 'Vĩ độ không hợp lệ.'; END IF;
  IF key='longitude' AND (value::numeric NOT BETWEEN -180 AND 180 OR value IN ('NaN','Infinity','-Infinity')) THEN RAISE EXCEPTION 'Kinh độ không hợp lệ.'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
DO $$ DECLARE tbl text; BEGIN
 FOREACH tbl IN ARRAY ARRAY['areas','restaurant_tables','categories','menu_items','recipes','ingredients','stock_movements','order_items','orders','payment_settings','profiles','attendance_settings','attendance_logs'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS phase2_validate ON public.%I',tbl);
  EXECUTE format('CREATE TRIGGER phase2_validate BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION restaurant_private.validate_row()',tbl);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION restaurant_private.guard_category_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN IF EXISTS(SELECT 1 FROM public.menu_items WHERE category_id=OLD.id) THEN RAISE EXCEPTION 'Danh mục vẫn còn món ăn.'; END IF; RETURN OLD; END $$;
DROP TRIGGER IF EXISTS phase2_category_guard ON public.categories;
CREATE TRIGGER phase2_category_guard BEFORE DELETE ON public.categories FOR EACH ROW EXECUTE FUNCTION restaurant_private.guard_category_delete();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA restaurant_private FROM PUBLIC,anon,authenticated;
COMMIT;
