import { supabase } from '@/integrations/supabase/client'
import type { Session } from '@supabase/supabase-js'
import { ReactNode,useCallback,useEffect,useRef,useState } from 'react'
import { Ctx,type AppRole } from './authState'

const USERNAME_DOMAIN = 'restaurant.local'
const RECOVERY_FLAG_KEY = 'auth_recovery_mode'

export function AuthProvider({ children }: { children: ReactNode }) {
 const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<AppRole | null>(null)
  const [loading, setLoading] = useState(true)
 const [isRecovery, setIsRecovery] = useState(() => sessionStorage.getItem(RECOVERY_FLAG_KEY) === '1')
  const isRecoveryRef = useRef(sessionStorage.getItem(RECOVERY_FLAG_KEY) === '1')

  const identity = useRef<string | null>(null)
  const generation = useRef(0)
  const invalidategeneration = useCallback(() => { generation.current++ }, [])
  const mounted = useRef(true)
  const fetchRole = async (uid: string) => {
    const request = ++generation.current
    try {
      const { data, error } = await supabase.from('user_roles').select('role').eq('user_id', uid)
      if (!mounted.current || identity.current !== uid || request !== generation.current) return
      // Multiple legacy roles are ambiguous; never silently pick a privilege.
      setRole(!error && data?.length === 1 ? data[0].role as AppRole : null)
    } catch {
      if (mounted.current && identity.current === uid && request === generation.current) setRole(null)
    } finally {
      if (mounted.current && request === generation.current) setLoading(false)
    }
  }

  useEffect(() => {
    mounted.current = true
    let authEventSeen = false
    const apply = (s: Session | null, recovery = false) => {
      invalidategeneration()
      identity.current = s?.user.id ?? null
      setSession(s); setRole(null)
      if (s?.user && !recovery && !isRecoveryRef.current) {
        setLoading(true)
        // Leave the Auth callback before querying the database.
        setTimeout(() => { if (mounted.current && identity.current === s.user.id) void fetchRole(s.user.id) }, 0)
      } else setLoading(false)
    }
    const { data: sub } = supabase.auth.onAuthStateChange((evt, s) => {
      authEventSeen = true
      if (evt === 'PASSWORD_RECOVERY') {
        isRecoveryRef.current = true; setIsRecovery(true)
        sessionStorage.setItem(RECOVERY_FLAG_KEY, '1')
      } else if (evt === 'SIGNED_OUT') {
        isRecoveryRef.current = false; setIsRecovery(false)
        sessionStorage.removeItem(RECOVERY_FLAG_KEY)
      }
      apply(s, evt === 'PASSWORD_RECOVERY')
    })
    void supabase.auth.getSession().then(({data,error}) => {
      if (mounted.current && !authEventSeen) apply(error ? null : data.session)
    }).catch(() => { if (mounted.current && !authEventSeen) apply(null) })
    const refresh = () => { if (identity.current && !isRecoveryRef.current) void fetchRole(identity.current) }
    window.addEventListener('focus', refresh)
    const channel = supabase.channel(`auth-role-${crypto.randomUUID()}`)
      .on('postgres_changes', {event:'*',schema:'public',table:'user_roles'}, refresh).subscribe()
    return () => {
      mounted.current = false; invalidategeneration(); identity.current = null
      sub.subscription.unsubscribe(); window.removeEventListener('focus', refresh)
      void supabase.removeChannel(channel)
    }
  }, [invalidategeneration])

  const signInWithUsername = async (username: string, password: string) => {
    const raw = username.trim().toLowerCase()

    // Nếu đã có @ thì dùng nguyên (admin dùng gmail hoặc email thật)
    // Nếu không có @ thì ghép @restaurant.local (staff, cashier, kitchen)
    const email = raw.includes('@') ? raw : `${raw}@${USERNAME_DOMAIN}`

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) return { error: 'Tên đăng nhập hoặc mật khẩu không đúng' }

    return {}
  }

  const signOut = async () => { await supabase.auth.signOut() }
  const refreshRole = async () => { if (session?.user) await fetchRole(session.user.id) }

  return (
    <Ctx.Provider value={{ session, user: session?.user ?? null, role, loading, isRecovery, signInWithUsername, signOut, refreshRole }}>
      {children}
    </Ctx.Provider>
  )
}
