import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Search, User, LayoutGrid, LogOut, ChefHat } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { NumberBadge, useGlobalCounts } from '@/hooks/useGlobalCounts'
import { Button } from '@/components/ui/button'
import { ROLE_LABEL } from '@/lib/roles'
import { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'

export default function StaffLayout() {
  const { signOut, user, role } = useAuth()
  const { tableAlerts } = useGlobalCounts()
  const loc = useLocation()
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!user?.id) return
    supabase.from('profiles').select('avatar_url').eq('id', user.id).maybeSingle()
      .then(({ data }) => setAvatarUrl(data?.avatar_url ?? null))
  }, [user?.id])
  
  const tabs = [
    { to: '/staff', icon: LayoutGrid, label: 'Sơ đồ bàn', badge: tableAlerts, end: true },
    
    { to: '/staff/me', icon: User,label: 'Tôi', badge: 0 },
  ]

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-56 flex-col border-r bg-card md:flex">
        <div className="flex items-center gap-2 border-b p-4">
         <NavLink to="/staff/me" className="h-9 w-9 shrink-0 rounded-lg overflow-hidden bg-primary text-primary-foreground block">
            {avatarUrl
              ? <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
              : <div className="grid h-full w-full place-items-center"><ChefHat className="h-5 w-5" /></div>
            }
          </NavLink>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold">Phục vụ</h1>
            <p className="truncate text-xs text-muted-foreground">
              {user?.user_metadata?.full_name ?? user?.email} 
            </p>
          </div>
        </div>
        
        <nav className="flex-1 space-y-0.5 p-2">
          {tabs.map(t => {
            const active = (t as any).end ? loc.pathname === t.to : loc.pathname.startsWith(t.to)
            return (
              <NavLink 
                key={t.to} 
                to={t.to} 
                end={(t as any).end}
                className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                }`}
              >
                {/* Đã dọn sạch NumberBadge ra khỏi div bọc icon */}
                <div className="relative">
                  <t.icon className="h-4 w-4"/>
                </div>
                
                {t.label}

                {/* ĐƯA XUỐNG ĐÂY: Để căn theo góc trên bên phải của cả thanh menu */}
                <NumberBadge n={t.badge}/>
              </NavLink>
            )
          })}
        </nav>
        
        <div className="border-t p-2">
          <Button variant="ghost" className="w-full justify-start" onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4"/>Đăng xuất
          </Button>
        </div>
      </aside>

      {/* Main + mobile chrome */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b bg-card px-4 py-3 md:hidden">
          <div>
            <h1 className="text-base font-bold">Phục vụ</h1>
            <p className="text-xs text-muted-foreground">
              {user?.user_metadata?.full_name ?? user?.email} 
            </p>
          </div>
          <Button size="icon" variant="ghost" onClick={signOut}><LogOut className="h-4 w-4"/></Button>
        </header>
        
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <Outlet />
        </main>
        
        {/* Mobile bottom bar */}
        <nav className="fixed inset-x-0 bottom-0 border-t bg-card/95 backdrop-blur md:hidden">
          <div className="grid grid-cols-3">
            {tabs.map(t => {
              const active = t.end ? loc.pathname === t.to : loc.pathname.startsWith(t.to)
              return (
                <NavLink 
                  key={t.to} 
                  to={t.to} 
                  end={t.end}
                  className={`relative flex flex-col items-center gap-1 py-3 text-xs font-medium ${
                    active ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  {/* Đã dọn sạch NumberBadge ra khỏi div bọc icon mobile */}
                  <div className="relative">
                    <t.icon className="h-5 w-5"/>
                  </div>
                  
                  {t.label}

                  {/* ĐƯA XUỐNG ĐÂY: Để hiển thị chuẩn trên giao diện điện thoại */}
                  <NumberBadge n={t.badge}/>
                </NavLink>
              )
            })}
          </div>
        </nav>
      </div>
    </div>
  )
}