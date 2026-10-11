-- Pending local migration; no cloud deployment authorized.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
-- Enforce the rule for all clients, including stale admin screens.
CREATE OR REPLACE FUNCTION public.guard_active_table_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status <> 'empty' OR OLD.merged_group_id IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.orders WHERE table_id = OLD.id) THEN
    RAISE EXCEPTION 'Không thể xóa bàn đã được đặt, đang phục vụ, chưa thanh toán hoặc đang ghép nhóm.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS guard_active_table_deletion ON public.restaurant_tables;
CREATE TRIGGER guard_active_table_deletion
BEFORE DELETE ON public.restaurant_tables
FOR EACH ROW EXECUTE FUNCTION public.guard_active_table_deletion();

COMMIT;
