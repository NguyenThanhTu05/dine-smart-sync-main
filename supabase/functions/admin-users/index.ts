// Admin user management: create / update password / delete
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
 
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
    const isAdmin = (roles ?? []).some((r: any) => r.role === 'admin')
    if (!isAdmin) return json({ error: 'forbidden' }, 403)
 
    if (action === 'create_user') {
      const { username, password, full_name, role, phone, birthday, address } = body
      if (!username || !password || !full_name || !role) return json({ error: 'missing fields' }, 400)
      if (role === 'admin') return json({ error: 'only one admin allowed' }, 400)
      const email = `${String(username).toLowerCase()}@${USERNAME_DOMAIN}`
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { username, full_name },
      })
      if (cErr) return json({ error: cErr.message }, 400)
      const uid = created.user!.id
      await admin.from('profiles').insert({
        id: uid, username, full_name, phone: phone || null,
        birthday: birthday || null, address: address || null, visible_password: password,
      })
      await admin.from('user_roles').insert({ user_id: uid, role })
      return json({ ok: true, user_id: uid })
    }
 
    if (action === 'update_password') {
      const { user_id, password } = body
      const { error } = await admin.auth.admin.updateUserById(user_id, { password })
      if (error) return json({ error: error.message }, 400)
      await admin.from('profiles').update({ visible_password: password }).eq('id', user_id)
      return json({ ok: true })
    }
 
    if (action === 'delete_user') {
      const { user_id } = body
      const { error } = await admin.auth.admin.deleteUser(user_id)
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }
 
    return json({ error: 'unknown action' }, 400)
  } catch (e: any) {
    return json({ error: e.message ?? 'server error' }, 500)
  }
 
  function json(b: unknown, status = 200) {
    return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
 