-- Prepared locally only. Requires separate approval before production deployment.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE OR REPLACE FUNCTION public.guard_active_table_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'empty' OR OLD.merged_group_id IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.orders WHERE table_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.table_groups WHERE primary_table_id = OLD.id) THEN
    RAISE EXCEPTION 'Không thể xóa bàn đang hoạt động, còn lịch sử hóa đơn hoặc liên kết nhóm bàn.';
  END IF;
  RETURN OLD;
END;
$$;
COMMIT;
