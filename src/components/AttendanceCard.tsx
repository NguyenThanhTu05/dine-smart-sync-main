import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { LogIn, LogOut, MapPin, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { haversineMeters, getCurrentPosition } from '@/lib/geo'

interface Settings { latitude: number; longitude: number; radius_m: number }
interface Log { id: string; kind: 'in' | 'out'; at: string; distance_m: number | null }

export function AttendanceCard() {
  const { user } = useAuth()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [today, setToday] = useState<Log[]>([])
  const [busy, setBusy] = useState(false)
  const [pos, setPos] = useState<{ lat: number; lon: number; dist: number } | null>(null)
  const [locating, setLocating] = useState(false)

  const load = async () => {
    const { data: s } = await supabase.from('attendance_settings').select('*').eq('id', 1).maybeSingle()
    setSettings(s as any)
    if (!user) return
    const start = new Date(); start.setHours(0, 0, 0, 0)
    const { data: l } = await supabase.from('attendance_logs')
      .select('id,kind,at,distance_m')
      .eq('user_id', user.id)
      .gte('at', start.toISOString())
      .order('at', { ascending: true })
    setToday((l ?? []) as Log[])
  }
  useEffect(() => { load() }, [user?.id])

  const refreshPos = async () => {
    if (!settings) return
    setLocating(true)
    try {
      const p = await getCurrentPosition()
      const dist = haversineMeters(p.coords.latitude, p.coords.longitude, settings.latitude, settings.longitude)
      setPos({ lat: p.coords.latitude, lon: p.coords.longitude, dist })
    } catch (e: any) {
      toast.error(e.message ?? 'Không lấy được vị trí')
    } finally { setLocating(false) }
  }
  useEffect(() => { if (settings) refreshPos() /* eslint-disable-next-line */ }, [settings?.latitude, settings?.longitude])

  const lastIn = [...today].reverse().find(l => l.kind === 'in')
  const lastOut = [...today].reverse().find(l => l.kind === 'out')
  const checkedIn = !!lastIn && (!lastOut || new Date(lastOut.at) < new Date(lastIn.at))
  const completed = !!lastIn && !!lastOut && new Date(lastOut.at) > new Date(lastIn.at)

  const inRange = !!pos && !!settings && pos.dist <= settings.radius_m

  const punch = async (kind: 'in' | 'out') => {
    if (!user || !pos || !inRange) return
    setBusy(true)
    const { error } = await supabase.from('attendance_logs').insert({
      user_id: user.id, kind, latitude: pos.lat, longitude: pos.lon, distance_m: Math.round(pos.dist),
    })
    setBusy(false)
    if (error) return toast.error(error.message)
    toast.success(kind === 'in' ? 'Đã Check-in' : 'Đã Check-out')
    load()
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
                  <span><Badge variant={l.kind === 'in' ? 'default' : 'secondary'} className="mr-2">{l.kind === 'in' ? 'IN' : 'OUT'}</Badge>{format(new Date(l.at), 'HH:mm:ss')}</span>
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
