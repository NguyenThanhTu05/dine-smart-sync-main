import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Search, Users, Phone, MapPin, Cake, Calendar, X } from 'lucide-react'
import { ROLE_LABEL } from '@/lib/roles'
import { format, parseISO } from 'date-fns'

interface Row {
  id: string; full_name: string; username: string; phone: string | null;
  address: string | null; birthday: string | null; avatar_url: string | null;
  hide_personal: boolean; role: string; hire_date: string | null;
}

export function MembersDirectoryCard() {
  const { role: myRole } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Row | null>(null)
  const [imgOpen, setImgOpen] = useState(false)

  useEffect(() => {
    (async () => {
      const { data: profiles } = await supabase.from('profiles').select('id,full_name,username,phone,address,birthday,avatar_url,hide_personal,hire_date').order('full_name')
      const { data: roles } = await supabase.from('user_roles').select('user_id,role')
      const byUid = new Map((roles ?? []).map(r => [r.user_id, r.role]))
      setRows((profiles ?? []).map(p => ({ ...p, role: byUid.get(p.id) ?? 'staff' } as Row)))
    })()
  }, [])

  const filtered = rows.filter(r =>
    !q || r.full_name.toLowerCase().includes(q.toLowerCase()) || r.username.toLowerCase().includes(q.toLowerCase())
  )

  const canSee = (r: Row) => myRole === 'admin' || !r.hide_personal

  return (
    <Card className="space-y-3 p-4">
      <h3 className="flex items-center gap-2 font-bold"><Users className="h-4 w-4 text-primary" />Thành viên ({rows.length})</h3>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm tên / username..." className="pl-9" />
      </div>
      <div className="max-h-72 space-y-2 overflow-y-auto">
        {filtered.map(r => (
          <div key={r.id} onClick={() => setSel(r)} className="flex items-center gap-3 rounded-lg border p-2 cursor-pointer hover:bg-muted/50 transition">
            <Avatar className="h-9 w-9">
              <AvatarImage src={r.avatar_url ?? undefined} />
              <AvatarFallback>{r.full_name?.[0] ?? '?'}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold">{r.full_name}</span>
                <Badge variant="secondary" className="shrink-0 text-[10px]">{ROLE_LABEL[r.role] ?? r.role}</Badge>
              </div>
              <div className="text-xs text-muted-foreground">@{r.username}</div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-center text-xs text-muted-foreground">Không có kết quả</p>}
      </div>

      <Dialog open={!!sel} onOpenChange={(o) => { if (!o) { setSel(null); setImgOpen(false) } }}>
        <DialogContent>
          {sel && (
            <>
              <DialogHeader><DialogTitle>Thông tin nhân viên</DialogTitle></DialogHeader>
              <div className="flex flex-col items-center gap-2">
                <Avatar
                  className="h-24 w-24 cursor-pointer ring-2 ring-transparent hover:ring-primary transition"
                  onClick={() => sel.avatar_url && setImgOpen(true)}
                >
                  <AvatarImage src={sel.avatar_url ?? undefined} />
                  <AvatarFallback className="text-2xl">{sel.full_name[0]}</AvatarFallback>
                </Avatar>

                <Dialog open={imgOpen} onOpenChange={setImgOpen}>
        <DialogContent className="max-w-lg p-2">
          {sel?.avatar_url && (
            <img src={sel.avatar_url} alt={sel?.full_name} className="h-auto w-full rounded-lg object-contain" />
          )}
        </DialogContent>
      </Dialog>

                <h2 className="text-lg font-bold">{sel.full_name}</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">@{sel.username}</span>
                  <Badge variant="secondary">{ROLE_LABEL[sel.role]}</Badge>
                </div>
              </div>
              <div className="space-y-2 rounded-lg border p-3 text-sm">
                {canSee(sel) ? (
                  <>
                    <Info icon={Phone} label="Số điện thoại" value={sel.phone || '—'} />
                    <Info icon={Cake} label="Ngày sinh" value={sel.birthday ? format(parseISO(sel.birthday), 'dd/MM/yyyy') : '—'} />
                    <Info icon={MapPin} label="Địa chỉ" value={sel.address || '—'} />
                    <Info icon={Calendar} label="Vào làm" value={sel.hire_date ? format(parseISO(sel.hire_date), 'dd/MM/yyyy') : '—'} />
                  </>
                ) : (
                  <p className="py-4 text-center text-xs text-muted-foreground">🔒 Nhân viên này đã ẩn thông tin cá nhân</p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function Info({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">{label}:</span>
      <span className="ml-auto font-medium">{value}</span>
    </div>
  )
}