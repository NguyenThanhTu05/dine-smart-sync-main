import type { LucideIcon } from 'lucide-react';
import { ChefHat,LayoutDashboard,LayoutGrid,LogOut,MapPin,Menu,QrCode,Receipt,User,Users,UtensilsCrossed } from 'lucide-react';
import { NavLink,Outlet,useLocation } from 'react-router-dom';
interface LayoutTab {to:string;icon:LucideIcon;label:string;badge?:number;end?:boolean}

import { NumberBadge } from '@/components/NumberBadge';
import { Button } from '@/components/ui/button';
import { Sheet,SheetContent,SheetTrigger } from '@/components/ui/sheet';
import { useAuth } from '@/contexts/authState';
import { useGlobalCounts } from '@/hooks/useGlobalCounts';
import { supabase } from '@/integrations/supabase/client';
import { useEffect,useState } from 'react';
export default function AdminLayout() {
  const { signOut, user } = useAuth()
  const { tableAlerts, openBills, lowStock } = useGlobalCounts()
  const loc = useLocation()
  const [open, setOpen] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [fullName, setFullName] = useState<string | null>(null)

  useEffect(() => {
    if (!user?.id) return
    supabase.from('profiles').select('avatar_url, full_name').eq('id', user.id).maybeSingle()
  .then(({ data }) => {
    setAvatarUrl(data?.avatar_url ?? null)
    setFullName(data?.full_name ?? null)
  })
  }, [user?.id])
  const tabs: LayoutTab[] = [
    { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
    { to: '/admin/tables', icon: LayoutGrid, label: 'Sơ đồ bàn', badge: tableAlerts },
    { to: '/admin/bills', icon: Receipt, label: 'Bill order', badge: openBills },
   { to: '/admin/catalog', icon: UtensilsCrossed, label: 'Menu & Tiện ích', badge: lowStock },
    { to: '/admin/payment', icon: QrCode, label: 'Thanh toán' },
    { to: '/admin/areas', icon: MapPin, label: 'Khu vực & Bàn' },
    { to: '/admin/staff', icon: Users, label: 'Nhân sự' },
  
    { to: '/admin/me', icon: User, label: 'Tôi' },
  ]
  const isActive = (t: LayoutTab) => t.end ? loc.pathname === t.to : (loc.pathname === t.to || loc.pathname.startsWith(t.to + '/'))

  const SidebarContent = ({ onNav }: { onNav?: () => void }) => (
    <>
      {/* FIXED: shrink-0 trên icon, min-w-0 + flex-1 + truncate trên text */}
      <div className="flex items-center gap-2 border-b p-4">
        <NavLink to="/admin/me" className="h-9 w-9 shrink-0 rounded-lg overflow-hidden bg-primary text-primary-foreground block">
          {avatarUrl
            ? <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
            : <div className="grid h-full w-full place-items-center"><ChefHat className="h-5 w-5" /></div>
          }
        </NavLink>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-bold">Quản lý</h1>
          <p className="truncate text-xs text-muted-foreground">
            {fullName ?? user?.email} 
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {tabs.map(t => {
          const active = isActive(t)
          return (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              onClick={onNav}
              className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
            >
              <div className="relative shrink-0">
                <t.icon className="h-4 w-4" />
              </div>
              <span className="truncate">{t.label}</span>
              <NumberBadge n={t.badge ?? 0} />
            </NavLink>
          )
        })}
      </nav>

      <div className="border-t p-2">
        <Button variant="ghost" className="w-full justify-start" onClick={signOut}>
          <LogOut className="mr-2 h-4 w-4" />
          Đăng xuất
        </Button>
      </div>
    </>
  )

  return (
    <div className="flex h-screen bg-background">
      <aside className="hidden w-60 flex-col border-r bg-card md:flex">
        <SidebarContent />
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="flex items-center justify-between border-b bg-card px-4 py-3 md:hidden">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button size="icon" variant="ghost" className="shrink-0">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="flex w-64 flex-col p-0">
                <SidebarContent onNav={() => setOpen(false)} />
              </SheetContent>
            </Sheet>
            {/* FIXED: min-w-0 + truncate cho mobile header */}
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-bold">Quản lý</h1>
              <p className="truncate text-xs text-muted-foreground">
                {fullName ?? user?.email} 
              </p>
            </div>
          </div>
          <Button size="icon" variant="ghost" className="shrink-0" onClick={signOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
