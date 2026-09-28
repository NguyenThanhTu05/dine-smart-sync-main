import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { differenceInDays, format, parseISO } from 'date-fns'
import { AvatarUpload } from '@/components/AvatarUpload'
import { AttendanceCard } from '@/components/AttendanceCard'
import { WheelDatePicker } from '@/components/WheelDatePicker'
import { ROLE_LABEL } from '@/lib/roles'
import { Loader2 } from 'lucide-react'
import { MembersDirectoryCard } from '@/components/MembersDirectoryCard'

export default function MePage() {
  const { user, role } = useAuth()
  const [p, setP] = useState<any>(null)
  const [loading, setLoading] = useState(true) // Quản lý trạng thái tải bằng biến độc lập

  useEffect(() => {
    if (!user) return
    setLoading(true)
    
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setP(data)
        } else {
          // Nếu chưa có dòng profile dưới DB, tự gán 1 object tạm để mở Form, tránh treo máy
          setP({
            id: user.id,
            full_name: user.user_metadata?.full_name || 'Thành viên mới',
            username: user.email?.split('@')[0] || 'user',
            phone: '',
            address: '',
            birthday: '',
            avatar_url: user.user_metadata?.avatar_url || '',
            hide_personal: false,
            hire_date: new Date().toISOString().split('T')[0]
          })
        }
        setLoading(false)
      })
  }, [user])

  if (!user) return <div className="grid h-40 place-items-center"><Loader2 className="animate-spin"/></div>
  if (loading) return <div className="p-6 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="animate-spin h-4 w-4"/> Đang tải hồ sơ...</div>

  const tenure = p?.hire_date ? differenceInDays(new Date(), parseISO(p.hire_date)) : 0

  const save = async () => {
    // Nếu ngày sinh bị bỏ trống hoặc là chuỗi rỗng, ép về null để Postgres chấp nhận không điền
    const cleanBirthday = p.birthday && p.birthday.trim() !== '' ? p.birthday : null

    // Dùng lệnh UPSERT (Nếu có rồi thì cập nhật, nếu chưa có thì chèn dòng mới vào DB)
    const { error } = await supabase.from('profiles').upsert({
      id: p.id,
      full_name: p.full_name, 
      username: p.username,
      phone: p.phone, 
      address: p.address,
      birthday: cleanBirthday, // Gửi giá trị đã xử lý an toàn lên DB
      avatar_url: p.avatar_url, 
      hide_personal: p.hide_personal,
      hire_date: p.hire_date
    })
    
    if (error) toast.error(error.message); else toast.success('Đã lưu thông tin hồ sơ')
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <Card className="flex flex-col items-center gap-3 p-6">
        <AvatarUpload
          value={p.avatar_url}
          fallback={p.full_name ?? 'A'}
          folder="avatars"
          onChange={async (url) => {
            // Cập nhật state cục bộ ngay lập tức để giao diện hiển thị ảnh mới luôn
            setP({ ...p, avatar_url: url })
            
            // SỬA TẠI ĐÂY: Rải toàn bộ object (...p) thay vì chỉ gửi id để tránh dính lỗi thiếu trường dữ liệu bắt buộc (NOT NULL)
            const { error } = await supabase
              .from('profiles')
              .upsert({ 
                ...p, 
                avatar_url: url 
              })
              
            if (error) toast.error(error.message); else toast.success(url ? 'Đã cập nhật ảnh' : 'Đã xoá ảnh')
          }}
        />
        <p className="text-xs text-muted-foreground">Nhấn vào ảnh để đổi hoặc xoá</p>
        <div className="text-center">
          <h2 className="text-lg font-bold">{p.full_name}</h2>
          <div className="mt-1 flex items-center justify-center gap-2">
            <p className="text-xs text-muted-foreground">@{p.username}</p>
            <Badge variant="secondary">{ROLE_LABEL[role ?? ''] ?? '—'}</Badge>
          </div>
          {p.hire_date && (
            <p className="mt-1 text-xs">Vào làm: {format(parseISO(p.hire_date), 'dd/MM/yyyy')} • Thâm niên {tenure} ngày</p>
          )}
        </div>
      </Card>
      {role !== 'admin' && <AttendanceCard />}

      <Card className="space-y-3 p-4">
        <Field label="Họ tên" value={p.full_name ?? ''} onChange={(v) => setP({ ...p, full_name: v })} />
        <Field label="Số điện thoại" value={p.phone ?? ''} onChange={(v) => setP({ ...p, phone: v })} />
        <div className="space-y-1.5">
          <Label>Ngày sinh</Label>
          <WheelDatePicker value={p.birthday ?? ''} onChange={(v) => setP({ ...p, birthday: v })} />
        </div>
        <Field label="Địa chỉ" value={p.address ?? ''} onChange={(v) => setP({ ...p, address: v })} />
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label>Ẩn thông tin cá nhân</Label>
            <p className="text-xs text-muted-foreground"></p>
          </div>
          <Switch checked={p.hide_personal} onCheckedChange={(v) => setP({ ...p, hide_personal: v })} />
        </div>
        <Button className="w-full" onClick={save}>Lưu thay đổi</Button>
      </Card>
      <MembersDirectoryCard />
    </div>
  )
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}