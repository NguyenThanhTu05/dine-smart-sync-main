import { createStaff } from '../_shared/createStaff.ts'
// Admin user management: create / update password / delete
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { dateInput, optionalText, passwordInput, phoneInput, requiredText, usernameInput } from '../_shared/inputValidation.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const USERNAME_DOMAIN = 'restaurant.local'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

    const admin = createClient(SUPABASE_URL, SERVICE_KEY)
    const body = await req.json().catch(() => ({}))
    const action = body.action as string

    // Auth check: tất cả action đều cần đăng nhập và có role admin
    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'unauthorized' }, 401)
    const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', user.id)
    const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === 'admin')
    if (!isAdmin) return json({ error: 'forbidden' }, 403)

    if (action === 'create_user') {
      let username: string, password: string, full_name: string, phone: string, birthday: string | null, address: string
      const { role } = body
      try { username = usernameInput(body.username); password = passwordInput(body.password); full_name = requiredText(body.full_name, 'Họ tên');
        phone = phoneInput(body.phone); birthday = dateInput(body.birthday, 'Ngày sinh', false); address = optionalText(body.address, 'Địa chỉ') }
      catch (error) { return json({ error: (error as Error).message }, 400) }
      if (!username || !password || !full_name || !role) return json({ error: 'missing fields' }, 400)
      if (role === 'admin') return json({ error: 'only one admin allowed' }, 400)
      if (!['staff','cashier','kitchen'].includes(role)) return json({ error: 'invalid role' }, 400)
      const email = `${String(username).toLowerCase()}@${USERNAME_DOMAIN}`
      const uid = await createStaff(
        () => admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username, full_name } }),
        id => userClient.rpc('restaurant_staff', { p_user: id, p_profile: { username, full_name, phone, birthday, address }, p_role: role, p_initialize: true }),
        id => admin.auth.admin.deleteUser(id),
      )
      return json({ ok: true, user_id: uid })
    }

    if (action === 'update_password') {
      const { user_id, password } = body
      try { passwordInput(password) } catch (error) { return json({ error: (error as Error).message }, 400) }
      const { error } = await admin.auth.admin.updateUserById(user_id, { password })
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    if (action === 'delete_user') {
      const { user_id } = body
      const { error } = await admin.auth.admin.deleteUser(user_id)
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    return json({ error: 'unknown action' }, 400)
  } catch (e: unknown) {
    return json({ error: e instanceof Error ? e.message : 'server error' }, 500)
  }

  function json(b: unknown, status = 200) {
    return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})

