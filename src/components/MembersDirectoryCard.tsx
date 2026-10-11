import { DirectoryInfo as Info } from '@/components/DirectoryInfo';
import { Avatar,AvatarFallback,AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dialog,DialogContent,DialogHeader,DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useDirectory,type DirectoryRow as Row } from '@/hooks/useDirectory';
import { ROLE_LABEL } from '@/lib/roles';
import { format,parseISO } from 'date-fns';
import { Cake,Calendar,MapPin,Phone,Search,Users } from 'lucide-react';
import { useState } from 'react';


export function MembersDirectoryCard() {
  const { rows, filtered, query: q, setQuery: setQ, canSeeSensitive } = useDirectory()
  const [sel, setSel] = useState<Row | null>(null)
  const [imgOpen, setImgOpen] = useState(false)


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
                {canSeeSensitive(sel) ? (
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
