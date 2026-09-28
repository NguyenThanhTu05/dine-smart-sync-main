import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react'
import { supabase } from '@/integrations/supabase/client'
import type { Session, User } from '@supabase/supabase-js'

export type AppRole = 'admin' | 'cashier' | 'kitchen' | 'staff'

interface AuthCtx {
  session: Session | null
  user: User | null
  role: AppRole | null
  loading: boolean
  isRecovery: boolean
  signInWithUsername: (username: string, password: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
  refreshRole: () => Promise<void>
}

const Ctx = createContext<AuthCtx>({} as AuthCtx)
export const useAuth = () => useContext(Ctx)

const USERNAME_DOMAIN = 'restaurant.local'
const RECOVERY_FLAG_KEY = 'auth_recovery_mode'

export function AuthProvider({ children }: { children: ReactNode }) {
 const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<AppRole | null>(null)
  const [loading, setLoading] = useState(true)
 const [isRecovery, setIsRecovery] = useState(() => sessionStorage.getItem(RECOVERY_FLAG_KEY) === '1')
  const isRecoveryRef = useRef(sessionStorage.getItem(RECOVERY_FLAG_KEY) === '1')

  const fetchRole = async (uid: string) => {
    const { data } = await supabase.from('user_roles').select('role').eq('user_id', uid).maybeSingle()
    setRole((data?.role as AppRole) ?? null)
  }

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((evt, s) => {
     if (evt === 'PASSWORD_RECOVERY') {
        isRecoveryRef.current = true
        setIsRecovery(true)
        sessionStorage.setItem(RECOVERY_FLAG_KEY, '1')
        setSession(s)
        setRole(null)
        return
      }
if (evt === 'SIGNED_OUT') {
        isRecoveryRef.current = false
        setIsRecovery(false)
        sessionStorage.removeItem(RECOVERY_FLAG_KEY)
      }

      setSession(s)
      if (s?.user && !isRecoveryRef.current) {
        setTimeout(() => fetchRole(s.user.id), 0)
      } else if (!s?.user) {
        setRole(null)
      }
    })
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.user && !isRecoveryRef.current) {
        fetchRole(session.user.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

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
