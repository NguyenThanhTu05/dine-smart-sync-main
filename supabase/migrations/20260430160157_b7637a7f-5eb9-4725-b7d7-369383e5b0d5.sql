
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

-- ============ INDEXES ============
CREATE INDEX idx_orders_table ON public.orders(table_id);
CREATE INDEX idx_orders_paid ON public.orders(is_paid);
CREATE INDEX idx_order_items_order ON public.order_items(order_id);
CREATE INDEX idx_order_items_status ON public.order_items(status);

-- ============ TRIGGER: deduct stock when item done ============
CREATE OR REPLACE FUNCTION public.deduct_stock_on_done()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r RECORD;
BEGIN
  IF NEW.status = 'done' AND (OLD.status IS DISTINCT FROM 'done') THEN
    FOR r IN SELECT ingredient_id, quantity FROM public.recipes WHERE menu_item_id = NEW.menu_item_id LOOP
      UPDATE public.ingredients SET stock = GREATEST(0, stock - (r.quantity * NEW.quantity)) WHERE id = r.ingredient_id;
      INSERT INTO public.stock_movements(ingredient_id, delta, reason)
      VALUES (r.ingredient_id, -(r.quantity * NEW.quantity), 'auto: order_item ' || NEW.id);
    END LOOP;
    NEW.done_at := now();
    -- mark menu items unavailable when any recipe ingredient is out
    UPDATE public.menu_items mi SET is_available = FALSE
    WHERE mi.id IN (
      SELECT DISTINCT rc.menu_item_id FROM public.recipes rc
      JOIN public.ingredients ig ON ig.id = rc.ingredient_id
      WHERE ig.stock <= 0
    );
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_deduct_stock
BEFORE UPDATE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.deduct_stock_on_done();

-- ============ TRIGGER: order total ============
CREATE OR REPLACE FUNCTION public.recompute_order_total()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE oid UUID;
BEGIN
  oid := COALESCE(NEW.order_id, OLD.order_id);
  UPDATE public.orders SET total = COALESCE((SELECT SUM(price_snapshot * quantity) FROM public.order_items WHERE order_id = oid),0)
  WHERE id = oid;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_total_ins AFTER INSERT OR UPDATE OR DELETE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.recompute_order_total();

-- ============ ENABLE RLS ============
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_settings ENABLE ROW LEVEL SECURITY;

-- ============ POLICIES ============
-- profiles: everyone authed sees basic; only admin & owner see full row. We'll filter sensitive fields on client. Use a view for public-safe columns later if needed.
CREATE POLICY "profiles_select_authed" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_admin_all" ON public.profiles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- user_roles
CREATE POLICY "roles_select_self_or_admin" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "roles_admin_manage" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- areas/tables/groups: read all authed, write admin (staff/cashier may update status)
CREATE POLICY "areas_read" ON public.areas FOR SELECT TO authenticated USING (true);
CREATE POLICY "areas_admin_write" ON public.areas FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "tables_read" ON public.restaurant_tables FOR SELECT TO authenticated USING (true);
CREATE POLICY "tables_admin_all" ON public.restaurant_tables FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "tables_staff_update" ON public.restaurant_tables FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'staff') OR public.has_role(auth.uid(),'cashier') OR public.has_role(auth.uid(),'kitchen'));

CREATE POLICY "groups_read" ON public.table_groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "groups_write" ON public.table_groups FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- categories/menu: read all, admin write; menu items also allowed update by system (kitchen trigger uses SECURITY DEFINER)
CREATE POLICY "cat_read" ON public.categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "cat_admin" ON public.categories FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "menu_read" ON public.menu_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "menu_admin" ON public.menu_items FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ingredients/recipes/stock: cashier + admin write; all read
CREATE POLICY "ing_read" ON public.ingredients FOR SELECT TO authenticated USING (true);
CREATE POLICY "ing_write" ON public.ingredients FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cashier')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cashier'));

CREATE POLICY "rec_read" ON public.recipes FOR SELECT TO authenticated USING (true);
CREATE POLICY "rec_admin" ON public.recipes FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "sm_read" ON public.stock_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "sm_write" ON public.stock_movements FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- orders & items
CREATE POLICY "orders_read" ON public.orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "orders_write" ON public.orders FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "oi_read" ON public.order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "oi_write" ON public.order_items FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- payment settings
CREATE POLICY "ps_read" ON public.payment_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "ps_admin" ON public.payment_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ REALTIME ============
ALTER TABLE public.restaurant_tables REPLICA IDENTITY FULL;
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.order_items REPLICA IDENTITY FULL;
ALTER TABLE public.menu_items REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.restaurant_tables;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.menu_items;

-- ============ ADMIN BOOTSTRAP RPC ============
-- Create user via service role done from edge function later. For now: helper to seed demo data.
CREATE OR REPLACE FUNCTION public.seed_demo_tables()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a1 UUID; a2 UUID; i INT;
BEGIN
  IF EXISTS (SELECT 1 FROM public.areas) THEN RETURN; END IF;
  INSERT INTO public.areas(name, sort_order) VALUES ('Tầng 1', 1) RETURNING id INTO a1;
  INSERT INTO public.areas(name, sort_order) VALUES ('Tầng 2', 2) RETURNING id INTO a2;
  FOR i IN 1..6 LOOP
    INSERT INTO public.restaurant_tables(area_id, name, seats, sort_order) VALUES (a1, 'Bàn ' || i, 4, i);
  END LOOP;
  FOR i IN 1..4 LOOP
    INSERT INTO public.restaurant_tables(area_id, name, seats, sort_order) VALUES (a2, 'Bàn ' || (i+6), 6, i);
  END LOOP;
END $$;

-- seed default categories & default items (Khăn, Lạc)
CREATE OR REPLACE FUNCTION public.seed_demo_menu()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c1 UUID; c2 UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM public.categories) THEN RETURN; END IF;
  INSERT INTO public.categories(name, sort_order) VALUES ('Khai vị', 1) RETURNING id INTO c1;
  INSERT INTO public.categories(name, sort_order) VALUES ('Món chính', 2) RETURNING id INTO c2;
  INSERT INTO public.menu_items(category_id, name, price, is_default) VALUES
    (c1, 'Khăn lạnh', 5000, TRUE),
    (c1, 'Lạc rang', 15000, TRUE),
    (c2, 'Bò xào', 120000, FALSE),
    (c2, 'Gà nướng', 180000, FALSE);
END $$;

SELECT public.seed_demo_tables();
SELECT public.seed_demo_menu();
