import { AttendanceCard } from '@/components/AttendanceCard'
import { AvatarUpload } from '@/components/AvatarUpload'
import { MembersDirectoryCard } from '@/components/MembersDirectoryCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { WheelDatePicker } from '@/components/WheelDatePicker'
import { useAuth } from '@/contexts/authState'
import { supabase } from '@/integrations/supabase/client'
import type { Profile } from '@/lib/domainTypes'
import { dateInput,optionalText,phoneInput,requiredText } from '@/lib/inputValidation'
import { ROLE_LABEL } from '@/lib/roles'
import { differenceInDays,format,parseISO } from 'date-fns'
import { Loader2 } from 'lucide-react'
import { useEffect,useState } from 'react'
import { toast } from 'sonner'

export default function MePage() {
  const { user, role } = useAuth()
  const [p, setP] = useState<Pick<Profile,'id'|'username'|'full_name'|'phone'|'address'|'birthday'|'avatar_url'|'hire_date'|'hide_personal'> | null>(null)
  const [loading, setLoading] = useState(true) // Quản lý trạng thái tải bằng biến độc lập

  useEffect(() => {
    if (!user) return
    setLoading(true)
    
    supabase
      .from('profiles')
      .select('id,username,full_name,phone,address,birthday,avatar_url,hire_date,hide_personal,created_at')
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
  if (loading || !p) return <div className="p-6 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="animate-spin h-4 w-4"/> Đang tải hồ sơ...</div>

  const tenure = p?.hire_date ? differenceInDays(new Date(), parseISO(p.hire_date)) : 0

  const save = async () => {
    let clean: { full_name: string; username: string; phone: string; address: string; birthday: string | null }
    try {
      clean = { full_name: requiredText(p.full_name, 'Họ tên'), username: requiredText(p.username, 'Tên đăng nhập'), phone: phoneInput(p.phone),
        address: optionalText(p.address, 'Địa chỉ'), birthday: dateInput(p.birthday, 'Ngày sinh', false) }
    } catch (error) { return toast.error((error as Error).message) }
    // Nếu ngày sinh bị bỏ trống hoặc là chuỗi rỗng, ép về null để Postgres chấp nhận không điền

    // Dùng lệnh UPSERT (Nếu có rồi thì cập nhật, nếu chưa có thì chèn dòng mới vào DB)
    const { error } = await supabase.from('profiles').upsert({
      id: p.id,
      ...clean,
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
            
            // Chỉ lưu các trường hồ sơ được phép, không sao chép dữ liệu xác thực.
            const { error } = await supabase
              .from('profiles')
              .upsert({ 
                id: p.id, username: p.username, full_name: p.full_name,
                phone: p.phone, address: p.address, birthday: p.birthday || null,
                hide_personal: p.hide_personal, hire_date: p.hire_date, avatar_url: url
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
