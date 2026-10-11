import { AppRole,useAuth } from '@/contexts/authState';
import { Loader2 } from 'lucide-react';
import { Navigate,useLocation } from 'react-router-dom';

export function RequireRole({ role, children }: { role: AppRole; children: JSX.Element }) {
  const { session, role: myRole, loading, isRecovery } = useAuth()
  const loc = useLocation()
  if (loading) return <div className="grid h-screen place-items-center"><Loader2 className="animate-spin"/></div>
  if (!session || isRecovery) return <Navigate to="/login" state={{ from: loc }} replace />
  if (myRole !== role) return <Navigate to={myRole ? `/${myRole}` : '/login'} replace />
  return children
}
