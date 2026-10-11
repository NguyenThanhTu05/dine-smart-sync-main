import type { Session,User } from '@supabase/supabase-js'
import { createContext,useContext } from 'react'
export type AppRole = 'admin' | 'cashier' | 'kitchen' | 'staff'

export interface AuthCtx {
  session: Session | null
  user: User | null
  role: AppRole | null
  loading: boolean
  isRecovery: boolean
  signInWithUsername: (username: string, password: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
  refreshRole: () => Promise<void>
}

export const Ctx = createContext<AuthCtx>({} as AuthCtx)
export const useAuth = () => useContext(Ctx)
