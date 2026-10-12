import { AnimatedHeading } from '@/components/TypographyMotion'
import { readPages } from '../../../supabase/functions/_shared/readPages'
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog,DialogContent,DialogFooter,DialogHeader,DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { csvRow } from '@/lib/csv';
import type { AttendanceLog,Profile,StaffProfile } from '@/lib/domainTypes';
import { errorMessage } from '@/lib/errors';
import { accountCreatedResponse, accountResponse } from '@/lib/functionResponses';
import { getCurrentPosition } from '@/lib/geo';
import { coordinateInput,dateInput,decimalInput,optionalText,passwordInput,phoneInput,requiredText,usernameInput } from '@/lib/inputValidation';
import { ROLE_LABEL } from '@/lib/roles';
import { Crosshair,Download,Key,Loader2,MapPin,Plus,Trash2 } from 'lucide-react';
import { useCallback,useEffect,useMemo,useRef,useState } from 'react';
import { toast } from '@/lib/notifications';
import { vietnamDayKey } from '../../../supabase/functions/_shared/vietnamTime';
interface AttendanceRow {user_id:string;date:string;inAt?:string;outAt?:string;distIn?:number|null;distOut?:number|null}

type Tab = 'staff' | 'location' | 'attendance'

export default function StaffManagement() {
  const [tab, setTab] = useState<Tab>('staff')

  return (
    <div className="space-y-4 p-6">
      <AnimatedHeading as="h1" className="text-2xl font-bold">Nhân sự</AnimatedHeading>

      {/* TABS */}
      <div className="flex gap-2 border-b pb-2">
        {([['staff', 'Tài Khoản'], ['location', 'Vị trí điểm danh'], ['attendance', 'Chấm công']] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors ${tab === key ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-border hover:bg-accent'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'staff' && <StaffTab />}
      {tab === 'location' && <LocationTab />}
      {tab === 'attendance' && <AttendanceTab />}
    </div>
  )
}

/* ========== TAB NHÂN SỰ ========== */
function StaffTab() {
  const [rows, setRows] = useState<StaffProfile[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ username: '', password: '', full_name: '', role: 'staff', phone: '', address: '', birthday: '' })
  const [show, setShow] = useState<Record<string, boolean>>({})
  const [pwOpen, setPwOpen] = useState<StaffProfile | null>(null)
  const [newPw, setNewPw] = useState('')

  const load = async () => {
    const { data: profiles } = await supabase.from('profiles').select('id,username,full_name,phone,address,birthday,avatar_url,hire_date,hide_personal,created_at').order('full_name')
    const { data: roles } = await supabase.from('user_roles').select('user_id,role')
    const byUid = new Map((roles ?? []).map(r => [r.user_id, r.role]))
    setRows((profiles ?? []).map(p => ({ ...p, role: byUid.get(p.id) ?? 'staff' })))
  }
  useEffect(() => { load() }, [])

  const create = async () => {
    let clean
    try { clean = { ...form, username: usernameInput(form.username), password: passwordInput(form.password), full_name: requiredText(form.full_name, 'Họ tên'),
      phone: phoneInput(form.phone), birthday: dateInput(form.birthday, 'Ngày sinh', false), address: optionalText(form.address, 'Địa chỉ') } }
    catch (error) { return toast.error((error as Error).message) }
    const { data, error } = await supabase.functions.invoke('admin-users', { body: { action: 'create_user', ...clean } })
    const parsed = accountCreatedResponse.safeParse(data)
    if (error || !parsed.success || parsed.data.error || !parsed.data.ok) return toast.error(error?.message ?? (parsed.success ? parsed.data.error : undefined) ?? 'Thao tác tài khoản chưa thành công')
    toast.success('Đã tạo tài khoản nhân viên'); setOpen(false); load()
    setForm({ username: '', password: '', full_name: '', role: 'staff', phone: '', address: '', birthday: '' })
  }
  const del = async (id: string) => {
    if (!confirm('Xóa tài khoản này?')) return
    const { data, error } = await supabase.functions.invoke('admin-users', { body: { action: 'delete_user', user_id: id } })
    const parsed = accountResponse.safeParse(data)
    if (error || !parsed.success || parsed.data.error || !parsed.data.ok) return toast.error(error?.message ?? (parsed.success ? parsed.data.error : undefined) ?? 'Thao tác tài khoản chưa thành công')
    toast.success('Đã xóa tài khoản nhân viên'); load()
  }
  const updatePw = async () => {
    if (!pwOpen) return
    try { passwordInput(newPw) } catch (error) { return toast.error((error as Error).message) }
    const { data, error } = await supabase.functions.invoke('admin-users', { body: { action: 'update_password', user_id: pwOpen.id, password: newPw } })
    const parsed = accountResponse.safeParse(data)
    if (error || !parsed.success || parsed.data.error || !parsed.data.ok) return toast.error(error?.message ?? (parsed.success ? parsed.data.error : undefined) ?? 'Thao tác tài khoản chưa thành công')
    toast.success('Đã đổi mật khẩu'); setPwOpen(null); setNewPw(''); load()
  }
  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" />Thêm tài khoản</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map(r => (
          <Card key={r.id} data-motion-id={`staff-${r.id}`} className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-bold">{r.full_name}</div>
                <div className="text-xs text-muted-foreground">@{r.username}</div>
                <Badge className="mt-1" variant="secondary">{ROLE_LABEL[r.role] ?? r.role}</Badge>
              </div>
              {r.role !== 'admin' && <Button size="icon" variant="ghost" onClick={() => del(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
            </div>
            <div className="mt-2 flex items-center gap-2 text-sm">
              <Key className="h-3 w-3 text-muted-foreground" />
              <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">{show[r.id] ? 'Không lưu mật khẩu' : '••••••••'}</span>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-base hover:bg-transparent hover:scale-125 transition-transform duration-200 select-none"
                onClick={() => setShow(s => ({ ...s, [r.id]: !s[r.id] }))}>
                {show[r.id] ? '😳' : '🫣'}
              </Button>
              <Button size="sm" variant="outline" className="ml-auto h-7" onClick={() => setPwOpen(r)}>Đổi MK</Button>
            </div>
            {r.phone && <div className="mt-1 text-xs text-muted-foreground">📞 {r.phone}</div>}
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Tạo tài khoản</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Vai trò</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Phục vụ</SelectItem>
                  <SelectItem value="cashier">Thu ngân</SelectItem>
                  <SelectItem value="kitchen">Bếp</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Username</Label><Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
            <div><Label>Mật khẩu</Label><Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Tối thiểu 6 ký tự" /></div>
            <div><Label>Họ tên</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>SĐT</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label>Ngày sinh</Label><Input type="date" value={form.birthday} onChange={(e) => setForm({ ...form, birthday: e.target.value })} /></div>
            </div>
            <div><Label>Địa chỉ</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={create}>Tạo</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pwOpen} onOpenChange={(o) => !o && setPwOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Đổi mật khẩu — {pwOpen?.full_name}</DialogTitle></DialogHeader>
          <Input value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="Mật khẩu mới (tối thiểu 6 ký tự)" />
          <DialogFooter><Button onClick={updatePw}>Lưu</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/* ========== TAB VỊ TRÍ ĐIỂM DANH ========== */
function LocationTab() {
  const [form, setForm] = useState({ latitude: '0', longitude: '0', radius_m: '100' })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.from('attendance_settings').select('*').eq('id', 1).maybeSingle().then(({ data }) => {
      if (data) setForm({ latitude: String(data.latitude), longitude: String(data.longitude), radius_m: String(data.radius_m) })
    })
  }, [])

  const useHere = async () => {
    setLoading(true)
    try {
      const position = await getCurrentPosition()
      setForm(f => ({ ...f, latitude: String(position.coords.latitude), longitude: String(position.coords.longitude) }))
      toast.success('Đã lấy vị trí hiện tại')
    } catch (e: unknown) {
      toast.error(errorMessage(e) ?? 'Không lấy được vị trí')
    } finally {
      setLoading(false)
    }
  }

  const save = async () => {
    let latitude: number, longitude: number, radius: number
    try { latitude = coordinateInput(form.latitude, 'Vĩ độ', 90); longitude = coordinateInput(form.longitude, 'Kinh độ', 180); radius = decimalInput(form.radius_m, 'Bán kính', 3, 99999999999.999, true) }
    catch (error) { return toast.error((error as Error).message) }
    const { error } = await supabase.from('attendance_settings').update({
  latitude,
  longitude,
  radius_m: radius,
  updated_at: new Date().toISOString()
}).eq('id', 1)
    if (error) toast.error(error.message); else toast.success('Đã lưu')
  }

  return (
    <Card className="max-w-xl space-y-3 p-4">
      <p className="text-xs text-muted-foreground">Nhân viên chỉ có thể Check-in/Check-out khi GPS nằm trong bán kính cho phép.</p>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Vĩ độ (latitude)</Label>
          <Input type="number" step="any" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} />
        </div>
        <div><Label>Kinh độ (longitude)</Label>
          <Input type="number" step="any" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} />
        </div>
      </div>
      <div><Label>Bán kính cho phép (mét)</Label>
        <Input type="number" value={form.radius_m} onChange={(e) => setForm({ ...form, radius_m: e.target.value })} />
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={useHere} disabled={loading}>
          {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Crosshair className="mr-1 h-4 w-4" />}Dùng vị trí hiện tại
        </Button>
        <Button onClick={save}><MapPin className="mr-1 h-4 w-4" />Lưu</Button>
      </div>
    </Card>
  )
}

/* ========== TAB CHẤM CÔNG ========== */
function AttendanceTab() {
  const [profiles, setProfiles] = useState<(Pick<Profile,'id'|'full_name'|'username'> & {role:string})[]>([])
  const [logs, setLogs] = useState<AttendanceLog[]>([])
  const [from, setFrom] = useState(vietnamDayKey().slice(0,7) + '-01')
  const [to, setTo] = useState(vietnamDayKey())
  const [userFilter, setUserFilter] = useState('all')

  const loadVersion = useRef(0)
  const invalidateLoad = useCallback(() => { loadVersion.current++ }, [])
  const load = useCallback(async () => {
    const request = ++loadVersion.current
    try {
      const fromIso = new Date(dateInput(from, 'Từ ngày') + 'T00:00:00+07:00').toISOString()
      const toIso = new Date(new Date(dateInput(to, 'Đến ngày') + 'T00:00:00+07:00').getTime() + 86400000).toISOString()
      if (fromIso >= toIso) throw new Error('Khoảng ngày không hợp lệ')
      const [ps, rs, latestLogs] = await Promise.all([
        readPages((offset,last) => supabase.from('profiles').select('id,full_name,username').order('id').range(offset,last)),
        readPages((offset,last) => supabase.from('user_roles').select('user_id,role').order('id').range(offset,last)),
        readPages((offset,last) => supabase.from('attendance_logs').select('*').gte('at',fromIso).lt('at',toIso).order('at').order('id').range(offset,last)),
      ])
      if (request !== loadVersion.current) return
      const byUid = new Map(rs.map(row => [row.user_id,row.role]))
      setProfiles(ps.map(profile => ({...profile,role:byUid.get(profile.id) ?? 'staff'})).filter(profile => profile.role !== 'admin'))
      setLogs(latestLogs)
    } catch (error) { if (request === loadVersion.current) toast.error(errorMessage(error)) }
  }, [from,to])
  useEffect(() => { void load(); return invalidateLoad }, [load,invalidateLoad])

  const rows = useMemo(() => {
    const map = new Map<string, AttendanceRow>()
    const filtered = userFilter === 'all' ? logs : logs.filter(l => l.user_id === userFilter)
    for (const l of filtered) {
      const date = vietnamDayKey(new Date(l.at))
      const key = `${l.user_id}|${date}`
      const r = map.get(key) ?? { user_id: l.user_id, date }
      if (l.kind === 'in') { if (!r.inAt || new Date(l.at) < new Date(r.inAt)) { r.inAt = l.at; r.distIn = l.distance_m } }
      else { if (!r.outAt || new Date(l.at) > new Date(r.outAt)) { r.outAt = l.at; r.distOut = l.distance_m } }
      map.set(key, r)
    }
    return [...map.values()].sort((a, b) => b.date.localeCompare(a.date))
  }, [logs, userFilter])

  const totalDays = useMemo(() => Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000) + 1, [from, to])
  const summary = useMemo(() => {
    if (userFilter === 'all') return null
    return { totalShifts: rows.length, checkins: rows.filter(r => r.inAt).length, checkouts: rows.filter(r => r.outAt).length }
  }, [rows, userFilter])

  const hours = (a?: string, b?: string) => a && b ? ((new Date(b).getTime() - new Date(a).getTime()) / 3_600_000).toFixed(2) : '—'
  const profileById = (id: string) => profiles.find(p => p.id === id)

  const exportCsv = () => {
    const header = ['Ngày', 'Nhân viên', 'Username', 'Chức vụ', 'Giờ vào', 'Giờ ra', 'Tổng giờ', 'KH IN (m)', 'KH OUT (m)']
    const lines = rows.map(r => {
      const p = profileById(r.user_id)
      return csvRow([r.date, p?.full_name ?? '', p?.username ?? '', ROLE_LABEL[p?.role ?? ''] ?? '',
        r.inAt ? new Date(r.inAt).toLocaleTimeString('vi-VN', {timeZone:'Asia/Ho_Chi_Minh',hour12:false}) : '', r.outAt ? new Date(r.outAt).toLocaleTimeString('vi-VN', {timeZone:'Asia/Ho_Chi_Minh',hour12:false}) : '',
        hours(r.inAt, r.outAt), r.distIn ?? '', r.distOut ?? ''])
    })
    const blob = new Blob(['\uFEFF'+[csvRow(header), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `chamcong_${from}_${to}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={exportCsv}><Download className="mr-1 h-4 w-4" />Xuất CSV</Button></div>
      <Card className="flex flex-wrap items-end gap-3 p-3">
        <div><Label>Từ</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><Label>Đến</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div className="min-w-[180px]">
          <Label>Nhân viên</Label>
          <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
            <option value="all">Tất cả</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </div>
      </Card>
      {summary && (
        <div className="grid grid-cols-4 gap-3">
          {[['Số ngày', totalDays, null], ['Ca làm', summary.totalShifts, totalDays], ['Check in', summary.checkins, totalDays], ['Check out', summary.checkouts, totalDays]].map(([label, val, total]) => (
            <Card key={label as string} className="p-3 text-center">
              <div className="text-2xl font-black">{val}{total ? <span className="text-sm text-muted-foreground font-normal">/{total}</span> : ''}</div>
              <div className="text-xs text-muted-foreground mt-1">{label}</div>
            </Card>
          ))}
        </div>
      )}
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left">
              <th>Ngày</th><th>Nhân viên</th><th>Chức vụ</th><th>Giờ vào</th><th>Giờ ra</th><th>Tổng (giờ)</th><th>Vị trí IN</th><th>Vị trí OUT</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const p = profileById(r.user_id)
              return (
                <tr key={`${r.user_id}-${r.date}`} className="border-b last:border-0 [&>td]:px-3 [&>td]:py-2">
                  <td>{r.date}</td>
                  <td>{p?.full_name ?? r.user_id.slice(0, 6)}</td>
                  <td><Badge variant="secondary">{ROLE_LABEL[p?.role ?? ''] ?? '—'}</Badge></td>
                  <td>{r.inAt ? new Date(r.inAt).toLocaleTimeString('vi-VN', {timeZone:'Asia/Ho_Chi_Minh',hour12:false}) : '—'}</td>
                  <td>{r.outAt ? new Date(r.outAt).toLocaleTimeString('vi-VN', {timeZone:'Asia/Ho_Chi_Minh',hour12:false}) : '—'}</td>
                  <td className="font-bold">{hours(r.inAt, r.outAt)}</td>
                  <td>{r.distIn ?? '—'}</td>
                  <td>{r.distOut ?? '—'}</td>
                </tr>
              )
            })}
            {rows.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Chưa có dữ liệu</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
