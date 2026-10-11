import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAuth } from '@/contexts/authState'
import { supabase } from '@/integrations/supabase/client'
import { errorMessage } from '@/lib/errors'
import { getCurrentPosition,haversineMeters } from '@/lib/geo'
import { Loader2,LogIn,LogOut,MapPin } from 'lucide-react'
import { useCallback,useEffect,useRef,useState } from 'react'
import { toast } from 'sonner'
import { vietnamDayRange } from '../../supabase/functions/_shared/vietnamTime'

interface Settings { latitude: number; longitude: number; radius_m: number }
interface Log { id: string; kind: 'in' | 'out'; at: string; distance_m: number | null }

export function AttendanceCard() {
  const { user } = useAuth()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [today, setToday] = useState<Log[]>([])
  const [busy, setBusy] = useState(false)
  const [pos, setPos] = useState<{ lat: number; lon: number; dist: number } | null>(null)
  const [locating, setLocating] = useState(false)

  const loadVersion = useRef(0)
  const invalidateloadVersion = useCallback(() => { loadVersion.current++ }, [])
  const load = useCallback(async () => {
    const version = ++loadVersion.current
    if (!user?.id) { setToday([]); return }
    try {
      const { start, end } = vietnamDayRange()
      const [s,l] = await Promise.all([
        supabase.from('attendance_settings').select('*').eq('id',1).maybeSingle(),
        supabase.from('attendance_logs').select('id,kind,at,distance_m').eq('user_id',user.id).gte('at',start).lt('at',end).order('at'),
      ])
      if (version !== loadVersion.current) return
      if (s.error || l.error) throw s.error ?? l.error
      setSettings(s.data as Settings | null); setToday((l.data ?? []) as Log[])
    } catch (error) {
      if (version === loadVersion.current) toast.error((error as {message?:string}).message ?? 'Không tải được chấm công')
    }
  }, [user?.id])
  useEffect(() => {
    void load()
    const refresh = () => { void load() }
    const channel = supabase.channel(`attendance-${crypto.randomUUID()}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'attendance_logs',filter:`user_id=eq.${user?.id}`},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'attendance_settings'},refresh)
      .subscribe(status => { if (status === 'SUBSCRIBED') refresh() })
    window.addEventListener('focus',refresh)
    const timer = setInterval(refresh,60000)
    return () => { invalidateloadVersion(); clearInterval(timer); window.removeEventListener('focus',refresh); void supabase.removeChannel(channel) }
  }, [load,user?.id,invalidateloadVersion])

  const latitude = settings?.latitude, longitude = settings?.longitude
  const refreshPos = useCallback(async () => {
    if (latitude == null || longitude == null) return
    setLocating(true)
    try {
      const p = await getCurrentPosition()
      const dist = haversineMeters(p.coords.latitude, p.coords.longitude, latitude, longitude)
      setPos({ lat: p.coords.latitude, lon: p.coords.longitude, dist })
    } catch (e: unknown) {
      toast.error(errorMessage(e) ?? 'Không lấy được vị trí')
    } finally { setLocating(false) }
  }, [latitude,longitude])
  useEffect(() => { void refreshPos() }, [refreshPos])

  const lastIn = [...today].reverse().find(l => l.kind === 'in')
  const lastOut = [...today].reverse().find(l => l.kind === 'out')
  const checkedIn = !!lastIn && (!lastOut || new Date(lastOut.at) < new Date(lastIn.at))
  const completed = !!lastIn && !!lastOut && new Date(lastOut.at) > new Date(lastIn.at)

  const inRange = !!pos && !!settings && pos.dist <= settings.radius_m

  const punch = async (kind: 'in' | 'out') => {
    if (!user || !pos || !inRange) return
    setBusy(true)
    try {
      const fresh = await getCurrentPosition()
      const { error } = await supabase.rpc('restaurant_attendance', {
        p_kind: kind, p_lat: fresh.coords.latitude, p_lon: fresh.coords.longitude, p_request: crypto.randomUUID(),
      })
      if (error) throw error
      toast.success(kind === 'in' ? 'Đã Check-in' : 'Đã Check-out')
    } catch (error) { toast.error(error instanceof Error ? error.message : (error as { message?: string }).message ?? 'Không thể chấm công') }
    finally { setBusy(false); void load() }
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-bold"><MapPin className="h-4 w-4 text-primary" />Điểm danh GPS</h3>
        <Button size="sm" variant="outline" onClick={refreshPos} disabled={locating}>
          {locating ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Cập nhật vị trí'}
        </Button>
      </div>

      {!settings ? (
        <p className="text-xs text-muted-foreground">Quản lý chưa cấu hình vị trí điểm danh.</p>
      ) : (
        <>
          <div className="rounded-lg bg-muted/50 p-2 text-xs">
            {pos ? (
              <>
                Khoảng cách tới quán: <b className={inRange ? 'text-success' : 'text-destructive'}>{Math.round(pos.dist)} m</b>
                {' '}/ cho phép {settings.radius_m} m
              </>
            ) : 'Đang chờ vị trí GPS...'}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              disabled={busy || checkedIn || completed || !inRange}
              onClick={() => punch('in')}
            >
              <LogIn className="mr-1 h-4 w-4" />Check-in
            </Button>
            <Button
              variant="secondary"
              disabled={busy || !checkedIn || completed || !inRange}
              onClick={() => punch('out')}
            >
              <LogOut className="mr-1 h-4 w-4" />Check-out
            </Button>
          </div>

          {today.length > 0 && (
            <div className="space-y-1 border-t pt-2 text-xs">
              {today.map(l => (
                <div key={l.id} className="flex items-center justify-between">
                  <span><Badge variant={l.kind === 'in' ? 'default' : 'secondary'} className="mr-2">{l.kind === 'in' ? 'IN' : 'OUT'}</Badge>{new Date(l.at).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false })}</span>
                  {l.distance_m != null && <span className="text-muted-foreground">{l.distance_m} m</span>}
                </div>
              ))}
            </div>
          )}
          {completed && <p className="text-xs text-success">Đã hoàn tất ca hôm nay ✓</p>}
        </>
      )}
    </Card>
  )
}
