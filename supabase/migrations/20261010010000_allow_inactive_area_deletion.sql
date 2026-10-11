-- Local proposal only; requires production approval. Tables and invoice history are retained.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
CREATE OR REPLACE FUNCTION restaurant_private.guard_layout() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_TABLE_NAME='areas' THEN
  IF EXISTS(SELECT 1 FROM public.restaurant_tables t WHERE t.area_id=OLD.id
    AND (t.status IS DISTINCT FROM 'empty' OR t.merged_group_id IS NOT NULL
      OR EXISTS(SELECT 1 FROM public.orders o WHERE o.table_id=t.id AND NOT o.is_paid)
      OR EXISTS(SELECT 1 FROM public.table_groups g WHERE g.primary_table_id=t.id))) THEN
    RAISE EXCEPTION 'Khu vực có bàn đang hoạt động, đơn mở hoặc liên kết nhóm; không thể xóa.';
  END IF;
  RETURN OLD;
 END IF;
 IF (NEW.area_id IS DISTINCT FROM OLD.area_id OR NEW.sort_order IS DISTINCT FROM OLD.sort_order)
   AND (OLD.status<>'empty' OR OLD.merged_group_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.orders WHERE table_id=OLD.id AND NOT is_paid)) THEN
  RAISE EXCEPTION 'Bàn đang hoạt động hoặc ghép nhóm; không thể đổi vị trí.';
 END IF;
 RETURN NEW;
END $$;
COMMIT;
