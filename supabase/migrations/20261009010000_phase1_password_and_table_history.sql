-- REVIEW REQUIRED: do not deploy without explicit approval.
-- No accounts, tables, orders, invoice amounts or Auth passwords are deleted.
-- The redundant plaintext password copies are cleared intentionally.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.discard_plaintext_password_copy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.visible_password := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS discard_plaintext_password_copy ON public.profiles;
CREATE TRIGGER discard_plaintext_password_copy
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.discard_plaintext_password_copy();

-- This does not update auth.users, credentials or recovery tokens.
UPDATE public.profiles SET visible_password = NULL WHERE visible_password IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_active_table_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status <> 'empty' OR OLD.merged_group_id IS NOT NULL THEN
    RAISE EXCEPTION 'Không thể xóa bàn đang hoạt động hoặc đang ghép nhóm.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.orders WHERE table_id = OLD.id) THEN
    RAISE EXCEPTION 'Không thể xóa bàn đã có hóa đơn để bảo toàn lịch sử.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS guard_active_table_deletion ON public.restaurant_tables;
CREATE TRIGGER guard_active_table_deletion
BEFORE DELETE ON public.restaurant_tables
FOR EACH ROW EXECUTE FUNCTION public.guard_active_table_deletion();

-- Cloud already has RESTRICT. Change CASCADE only on older local schemas;
-- leave unrelated foreign keys and all referenced rows intact.
DO $$
DECLARE constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.orders'::regclass
      AND confrelid = 'public.restaurant_tables'::regclass
      AND contype = 'f' AND confdeltype = 'c'
      AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
                          WHERE attrelid = 'public.orders'::regclass
                            AND attname = 'table_id')]::smallint[]
  LOOP
    EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT %I', constraint_row.conname);
    EXECUTE format('ALTER TABLE public.orders ADD CONSTRAINT %I FOREIGN KEY (table_id) REFERENCES public.restaurant_tables(id) ON DELETE RESTRICT', constraint_row.conname);
  END LOOP;
END;
$$;

COMMIT;
