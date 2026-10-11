-- READ ONLY. Run against the explicitly approved staging environment first.
-- Counts/metadata only. Does not print customer rows, passwords or credentials.
BEGIN READ ONLY;
SELECT table_name,column_name,data_type,udt_name,numeric_precision,numeric_scale,is_nullable
FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position;
SELECT count(*) AS duplicate_recipe_pairs FROM (
 SELECT menu_item_id,ingredient_id FROM public.recipes GROUP BY menu_item_id,ingredient_id HAVING count(*)>1
) x;
SELECT count(*) AS recipes_requiring_manual_review FROM public.recipes
WHERE menu_item_id IS NULL OR ingredient_id IS NULL OR quantity<=0 OR quantity::text IN ('NaN','Infinity','-Infinity');
SELECT count(*) AS recipes_with_more_than_three_decimals FROM public.recipes WHERE quantity<>round(quantity,3);
SELECT count(*) FILTER(WHERE stock<0) AS negative_stock_rows, count(*) FILTER(WHERE stock<>round(stock,3)) AS extra_precision_rows
FROM public.ingredients;
SELECT count(*) AS invalid_menu_prices FROM public.menu_items
WHERE price<0 OR price>9999999999.99 OR price<>round(price,2) OR price::text IN ('NaN','Infinity','-Infinity');
SELECT count(*) AS legacy_open_items_before_inventory_snapshot FROM public.order_items i
JOIN public.orders o ON o.id=i.order_id WHERE NOT o.is_paid;
SELECT count(*) AS inconsistent_groups FROM (
 SELECT g.id FROM public.table_groups g LEFT JOIN public.restaurant_tables t ON t.merged_group_id=g.id
 GROUP BY g.id,g.primary_table_id HAVING count(t.id)<2 OR count(DISTINCT t.status)>1
 OR NOT coalesce(bool_or(t.id=g.primary_table_id),false)
) x;
SELECT tgname,pg_get_triggerdef(oid) AS definition FROM pg_trigger
WHERE tgrelid='public.order_items'::regclass AND NOT tgisinternal ORDER BY tgname;
SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check FROM pg_policies
WHERE schemaname='public' ORDER BY tablename,policyname;
ROLLBACK;
