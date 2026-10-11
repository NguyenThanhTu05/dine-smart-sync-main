-- Synthetic schema only; no credentials, customer data or cloud connection.
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY, encrypted_password text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated;

-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin','cashier','kitchen','staff');
CREATE TYPE public.table_status AS ENUM ('empty','serving','awaiting_payment','needs_cleanup');
CREATE TYPE public.order_item_status AS ENUM ('pending','cooking','done','served');
CREATE TYPE public.payment_method AS ENUM ('cash','qr');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  birthday DATE,
  address TEXT,
  avatar_url TEXT,
  hire_date DATE NOT NULL DEFAULT CURRENT_DATE,
  visible_password TEXT,
  hide_personal BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE(user_id, role)
);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role)
$$;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.app_role LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT role FROM public.user_roles WHERE user_id=auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_authenticated()
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$ SELECT auth.uid() IS NOT NULL $$;

-- ============ AREAS & TABLES ============
CREATE TABLE public.areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.restaurant_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID REFERENCES public.areas(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  seats INT NOT NULL DEFAULT 4,
  status public.table_status NOT NULL DEFAULT 'empty',
  merged_group_id UUID,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.table_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name TEXT NOT NULL,
  primary_table_id UUID REFERENCES public.restaurant_tables(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ MENU ============
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE public.menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  image_url TEXT,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ INGREDIENTS / RECIPES ============
CREATE TABLE public.ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'g',
  stock NUMERIC(14,3) NOT NULL DEFAULT 0,
  min_stock NUMERIC(14,3) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  quantity NUMERIC(14,3) NOT NULL,
  notes TEXT,
  UNIQUE(menu_item_id, ingredient_id)
);

CREATE TABLE public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  delta NUMERIC(14,3) NOT NULL,
  reason TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ ORDERS ============
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES public.restaurant_tables(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES auth.users(id),
  notes TEXT,
  is_paid BOOLEAN NOT NULL DEFAULT FALSE,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method public.payment_method,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES public.menu_items(id),
  name_snapshot TEXT NOT NULL,
  price_snapshot NUMERIC(12,2) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  notes TEXT,
  status public.order_item_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  done_at TIMESTAMPTZ,
  served_at TIMESTAMPTZ
);

-- ============ PAYMENT SETTINGS ============
CREATE TABLE public.payment_settings (
  id INT PRIMARY KEY DEFAULT 1,
  qr_image_url TEXT,
  bank_name TEXT,
  account_holder TEXT,
  account_number TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);
INSERT INTO public.payment_settings(id) VALUES (1);


ALTER TABLE public.orders DROP CONSTRAINT orders_table_id_fkey;
ALTER TABLE public.orders ADD CONSTRAINT orders_table_id_fkey FOREIGN KEY(table_id) REFERENCES public.restaurant_tables(id) ON DELETE RESTRICT;
ALTER TABLE public.orders DROP CONSTRAINT orders_staff_id_fkey;
ALTER TABLE public.orders ADD CONSTRAINT orders_staff_id_fkey FOREIGN KEY(staff_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.restaurant_tables ADD CONSTRAINT fk_restaurant_tables_group FOREIGN KEY(merged_group_id) REFERENCES public.table_groups(id) ON DELETE SET NULL;
ALTER TABLE public.menu_items ADD COLUMN no_cook boolean DEFAULT false;
ALTER TABLE public.menu_items ADD COLUMN recipe text;
ALTER TABLE public.order_items ADD COLUMN no_cook boolean NOT NULL DEFAULT false;
ALTER TABLE public.orders ADD COLUMN discount_percent numeric;
ALTER TABLE public.payment_settings ADD COLUMN vat_percent numeric NOT NULL DEFAULT 0;
ALTER TABLE public.payment_settings ADD COLUMN service_percent numeric NOT NULL DEFAULT 0;
ALTER TABLE public.payment_settings ADD COLUMN global_discount_percent numeric DEFAULT 0;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
-- Verified cloud policies omitted from the original minimal fixture.
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY areas_read ON public.areas FOR SELECT TO authenticated USING(true);
CREATE POLICY areas_admin ON public.areas FOR ALL TO authenticated USING(public.has_role(auth.uid(),'admin')) WITH CHECK(public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.deduct_stock_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE ingredients i
  SET stock = i.stock - (r.quantity * NEW.quantity)
  FROM recipes r
  WHERE r.menu_item_id = NEW.menu_item_id
  AND r.ingredient_id = i.id;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.restore_stock_on_delete()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE ingredients i
  SET stock = i.stock + (r.quantity * OLD.quantity)
  FROM recipes r
  WHERE r.menu_item_id = OLD.menu_item_id
  AND r.ingredient_id = i.id;
  RETURN OLD;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.restore_stock_on_update()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.quantity < OLD.quantity THEN
    UPDATE ingredients i
    SET stock = i.stock + (r.quantity * (OLD.quantity - NEW.quantity))
    FROM recipes r
    WHERE r.menu_item_id = OLD.menu_item_id
    AND r.ingredient_id = i.id;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE TRIGGER trg_deduct_stock_insert AFTER INSERT ON public.order_items FOR EACH ROW EXECUTE FUNCTION deduct_stock_on_insert();

CREATE TRIGGER trg_restore_stock_delete AFTER DELETE ON public.order_items FOR EACH ROW EXECUTE FUNCTION restore_stock_on_delete();

CREATE TRIGGER trg_restore_stock_update AFTER UPDATE ON public.order_items FOR EACH ROW EXECUTE FUNCTION restore_stock_on_update();


-- Attendance settings (single row)
CREATE TABLE public.attendance_settings (
  id INT PRIMARY KEY DEFAULT 1,
  latitude NUMERIC NOT NULL DEFAULT 0,
  longitude NUMERIC NOT NULL DEFAULT 0,
  radius_m INT NOT NULL DEFAULT 100,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT attendance_settings_singleton CHECK (id = 1)
);
INSERT INTO public.attendance_settings (id) VALUES (1);

ALTER TABLE public.attendance_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY att_settings_read ON public.attendance_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY att_settings_admin ON public.attendance_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Attendance logs
CREATE TABLE public.attendance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('in','out')),
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  latitude NUMERIC,
  longitude NUMERIC,
  distance_m NUMERIC
);
CREATE INDEX att_logs_user_at_idx ON public.attendance_logs (user_id, at DESC);

ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY att_logs_select_own_or_admin ON public.attendance_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY att_logs_insert_own ON public.attendance_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

GRANT SELECT,INSERT,UPDATE,DELETE ON public.attendance_settings,public.attendance_logs TO authenticated;

-- Match the read-only information_schema snapshot from cloud (2026-10-09),
-- including unconstrained numeric columns and nullable recipe links. These
-- ALTERs are fixture construction only, never a production migration.
ALTER TABLE public.menu_items ALTER COLUMN price TYPE numeric;
ALTER TABLE public.ingredients ALTER COLUMN stock TYPE numeric, ALTER COLUMN min_stock TYPE numeric;
ALTER TABLE public.recipes ALTER COLUMN quantity TYPE numeric, ALTER COLUMN quantity SET DEFAULT 0,
 ALTER COLUMN menu_item_id DROP NOT NULL, ALTER COLUMN ingredient_id DROP NOT NULL,
 DROP COLUMN notes, ADD COLUMN created_at timestamptz DEFAULT now(), DROP CONSTRAINT recipes_menu_item_id_ingredient_id_key;
ALTER TABLE public.stock_movements ALTER COLUMN delta TYPE numeric;
ALTER TABLE public.stock_movements DROP CONSTRAINT stock_movements_created_by_fkey;
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_created_by_fkey FOREIGN KEY(created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.orders ALTER COLUMN total TYPE numeric;
ALTER TABLE public.order_items ALTER COLUMN price_snapshot TYPE numeric;
ALTER TABLE public.attendance_settings ALTER COLUMN radius_m TYPE numeric;
ALTER TABLE public.restaurant_tables ADD COLUMN position_x numeric DEFAULT 20, ADD COLUMN position_y numeric DEFAULT 20;
