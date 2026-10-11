import { DirectoryInfo as Info } from '@/components/DirectoryInfo';
import { Avatar,AvatarFallback,AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dialog,DialogContent,DialogHeader,DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useDirectory,type DirectoryRow as Row } from '@/hooks/useDirectory';
import { ROLE_LABEL } from '@/lib/roles';
import { format,parseISO } from 'date-fns';
import { Cake,Calendar,MapPin,Phone,Search } from 'lucide-react';
import { useState } from 'react';


export default function ContactsPage() {
  const { filtered, query: q, setQuery: setQ, canSeeSensitive } = useDirectory()
  const [sel, setSel] = useState<Row | null>(null)
  const [preview, setPreview] = useState<string | null>(null)


  return (
    <div className="space-y-3 p-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm tên / username..." className="pl-9" />
      </div>
      {filtered.map(r => (
        <Card key={r.id} className="flex cursor-pointer items-center gap-3 p-3 transition hover:bg-muted/50" onClick={() => setSel(r)}>
          <Avatar className="h-12 w-12"><AvatarImage src={r.avatar_url ?? undefined}/><AvatarFallback>{r.full_name[0]}</AvatarFallback></Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-semibold">{r.full_name}</span>
              <Badge variant="secondary" className="shrink-0 text-[10px]">{ROLE_LABEL[r.role]}</Badge>
            </div>
            <div className="text-xs text-muted-foreground">@{r.username}</div>
          </div>
        </Card>
      ))}

      <Dialog open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
        <DialogContent>
          {sel && (
            <>
              <DialogHeader><DialogTitle>Thông tin nhân viên</DialogTitle></DialogHeader>
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={() => sel.avatar_url && setPreview(sel.avatar_url)}
                  className="rounded-full focus:outline-none focus:ring-2 focus:ring-primary"
                  aria-label="Xem ảnh đại diện"
                >
                  <Avatar className="h-24 w-24 cursor-zoom-in">
                    <AvatarImage src={sel.avatar_url ?? undefined}/>
                    <AvatarFallback className="text-2xl">{sel.full_name[0]}</AvatarFallback>
                  </Avatar>
                </button>
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

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-lg p-2">
          {preview && <img src={preview} alt="Ảnh đại diện" className="h-auto w-full rounded-lg object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  )
}
