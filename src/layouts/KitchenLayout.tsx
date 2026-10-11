import { NumberBadge } from '@/components/NumberBadge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/authState';
import { useGlobalCounts } from '@/hooks/useGlobalCounts';
import { supabase } from '@/integrations/supabase/client';
import type { LucideIcon } from 'lucide-react';
import { ChefHat,ClipboardList,LogOut,User } from 'lucide-react';
import { useEffect,useState } from 'react';
import { NavLink,Outlet,useLocation } from 'react-router-dom';
interface LayoutTab {to:string;icon:LucideIcon;label:string;badge?:number;end?:boolean}

export default function KitchenLayout() {
  const { signOut, user } = useAuth()
  const { kitchenPending } = useGlobalCounts()
  const loc = useLocation()
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!user?.id) return
    supabase.from('profiles').select('avatar_url').eq('id', user.id).maybeSingle()
      .then(({ data }) => setAvatarUrl(data?.avatar_url ?? null))
  }, [user?.id])
  
  const tabs: LayoutTab[] = [
    { to: '/kitchen', icon: ClipboardList, label: 'Chế biến', badge: kitchenPending, end: true },
    
    { to: '/kitchen/me', icon: User, label: 'Tôi', badge: 0 },
  ]

  return (
    <div className="flex h-screen bg-background">
      {/* --- MENU SIDEBAR (MÁY TÍNH) --- */}
      <aside className="hidden w-56 flex-col border-r bg-card md:flex">
        <div className="flex items-center gap-2 border-b p-4">
         <NavLink to="/kitchen/me" className="h-9 w-9 shrink-0 rounded-lg overflow-hidden bg-primary text-primary-foreground block">
            {avatarUrl
              ? <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
              : <div className="grid h-full w-full place-items-center"><ChefHat className="h-5 w-5" /></div>
            }
          </NavLink>
          <div>
            <h1 className="text-sm font-bold">Bếp</h1>
            <p className="text-xs text-muted-foreground">
              {user?.user_metadata?.full_name ?? user?.email} 
            </p>
          </div>
        </div>
        
        <nav className="flex-1 space-y-0.5 p-2">
          {tabs.map(t => {
            const active = t.end ? loc.pathname === t.to : (loc.pathname === t.to || loc.pathname.startsWith(t.to + '/'))
            return (
              <NavLink 
                key={t.to} 
                to={t.to} 
                end={t.end}
                className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                }`}
              >
                {/* Đã xóa NumberBadge trong div này để không đè icon */}
                <div className="relative">
                  <t.icon className="h-4 w-4"/>
                </div>
                
                {t.label}

                {/* ĐÃ ĐỔI VỊ TRÍ: Đưa ra ngoài cùng để bay lên góc phải thanh menu */}
                <NumberBadge n={t.badge ?? 0}/>
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

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* HEADER MOBILE */}
        <header className="flex items-center justify-between border-b bg-card px-4 py-3 md:hidden">
          <div>
            <h1 className="text-base font-bold">Bếp</h1>
            <p className="text-xs text-muted-foreground">
              {user?.user_metadata?.full_name ?? user?.email} 
            </p>
          </div>
          <Button size="icon" variant="ghost" onClick={signOut}><LogOut className="h-4 w-4"/></Button>
        </header>
        
        {/* VIEW CONTENT */}
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0"><Outlet/></main>
        
        {/* --- MENU BOTTOM BAR (ĐIỆN THOẠI) --- */}
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur md:hidden">
          <div className="grid grid-cols-2">
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
                  {/* Đã xóa NumberBadge khỏi đây để nó căn chuẩn theo khung tab mobile */}
                  <div className="relative">
                    <t.icon className="h-5 w-5"/>
                  </div>
                  
                  {t.label}

                  {/* ĐÃ ĐỔI VỊ TRÍ: Đưa xuống cuối để nó không phá vỡ cấu trúc icon */}
                  <NumberBadge n={t.badge ?? 0}/>
                </NavLink>
              )
            })}
          </div>
        </nav>
      </div>
    </div>
  )
}
