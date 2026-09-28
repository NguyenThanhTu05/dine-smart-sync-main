
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
