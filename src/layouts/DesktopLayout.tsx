import type { LucideIcon } from 'lucide-react';
import { ChefHat,LayoutGrid,LogOut,MapPin,Menu,Receipt,User } from 'lucide-react';
import { NavLink,Outlet,useLocation } from 'react-router-dom';
interface LayoutTab {to:string;icon:LucideIcon;label:string;badge?:number;end?:boolean}

import { NumberBadge } from '@/components/NumberBadge';
import { Button } from '@/components/ui/button';
import { Sheet,SheetContent,SheetTrigger } from '@/components/ui/sheet';
import { useAuth } from '@/contexts/authState';
import { useGlobalCounts } from '@/hooks/useGlobalCounts';
import { supabase } from '@/integrations/supabase/client';
import { useEffect,useState } from 'react';
export default function DesktopLayout({ rolePrefix, title, extraTabs = [] }: {
  rolePrefix: string
  title: string
  extraTabs?: LayoutTab[]
}) {
  const { signOut, user } = useAuth()
  const { tableAlerts, openBills } = useGlobalCounts()
  const loc = useLocation()
  const [open, setOpen] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!user?.id) return
    supabase.from('profiles').select('avatar_url').eq('id', user.id).maybeSingle()
      .then(({ data }) => setAvatarUrl(data?.avatar_url ?? null))
  }, [user?.id])

  const tabs: LayoutTab[] = [
    { to: `/${rolePrefix}`, icon: LayoutGrid, label: 'Sơ đồ bàn', badge: tableAlerts, end: true },
    { to: `/${rolePrefix}/bills`, icon: Receipt, label: 'Bill order', badge: openBills },
    { to: `/${rolePrefix}/areas`, icon: MapPin, label: 'Khu vực & Bàn', badge: 0 },
    ...extraTabs,

    { to: `/${rolePrefix}/me`, icon: User, label: 'Tôi', badge: 0 },
  ]

  const isActive = (t: LayoutTab) => t.end ? loc.pathname === t.to : (loc.pathname === t.to || loc.pathname.startsWith(t.to + '/'))

  const SidebarContent = ({ onNav }: { onNav?: () => void }) => (
    <>
      <div className="flex items-center gap-2 border-b p-4">
        <NavLink to={`/${rolePrefix}/me`} className="h-9 w-9 shrink-0 rounded-lg overflow-hidden bg-primary text-primary-foreground block">
          {avatarUrl
            ? <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
            : <div className="grid h-full w-full place-items-center"><ChefHat className="h-5 w-5" /></div>
          }
        </NavLink>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-bold">{title}</h1>
          <p className="truncate text-xs text-muted-foreground">{user?.user_metadata?.full_name ?? user?.email} </p>
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
              className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              }`}
            >
              <div className="relative shrink-0">
                <t.icon className="h-4 w-4"/>
              </div>
              <span className="truncate">{t.label}</span>
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
    </>
  )

  return (
    <div className="flex h-screen bg-background">
      <aside className="hidden w-60 flex-col border-r bg-card md:flex">
        <SidebarContent />
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b bg-card px-4 py-3 md:hidden">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button size="icon" variant="ghost" className="shrink-0">
                  <Menu className="h-5 w-5"/>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="flex w-64 flex-col p-0">
                <SidebarContent onNav={() => setOpen(false)}/>
              </SheetContent>
            </Sheet>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-bold">{title}</h1>
              <p className="truncate text-xs text-muted-foreground">{user?.user_metadata?.full_name ?? user?.email} </p>
            </div>
          </div>
          <Button size="icon" variant="ghost" className="shrink-0" onClick={signOut}>
            <LogOut className="h-4 w-4"/>
          </Button>
        </header>
        <main className="flex-1 overflow-y-auto"><Outlet /></main>
      </div>
    </div>
  )
}
