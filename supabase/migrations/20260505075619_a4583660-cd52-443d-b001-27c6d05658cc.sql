DROP POLICY IF EXISTS roles_select_self_or_admin ON public.user_roles;
CREATE POLICY roles_select_authed ON public.user_roles FOR SELECT TO authenticated USING (true);