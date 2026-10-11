import { supabase } from '@/integrations/supabase/client'
import { readableError } from '@/lib/restaurantTransactions'
import { subscribeTableChanges } from '@/lib/tableSync'
import { useCallback,useEffect,useRef,useState } from 'react'

export type TableStatus = 'empty' | 'serving' | 'awaiting_payment' | 'needs_cleanup'

export interface RestaurantTable {
  id: string
  area_id: string | null
  name: string
  seats: number
  status: TableStatus
  merged_group_id: string | null
  sort_order: number
}
export interface Area { id: string; name: string; sort_order: number }

export function useTables() {
  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const alive = useRef(true)
  const revision = useRef(0)
  const invalidaterevision = useCallback(() => { revision.current++ }, [])
  const reload = useCallback(async () => {
    const request = ++revision.current
    try {
      const [t, a] = await Promise.all([
        supabase.from('restaurant_tables').select('*').order('sort_order').order('id'),
        supabase.from('areas').select('*').order('sort_order').order('id'),
      ])
      if (t.error || a.error) throw t.error ?? a.error
      if (!alive.current || request !== revision.current) return
      setTables(t.data ?? []); setAreas(a.data ?? []); setError(null)
    } catch (error) {
      if (alive.current && request === revision.current) setError(readableError(error))
    } finally { if (alive.current && request === revision.current) setLoading(false) }
  }, [])
  useEffect(() => {
    alive.current = true
    void reload()
    const refresh = () => { void reload() }
    const stop = subscribeTableChanges(refresh)
    const events = ['table-status-changed-local', 'sync-group-status', 'tables-need-reload', 'focus']
    events.forEach(event => window.addEventListener(event, refresh))
    return () => {
      alive.current = false; invalidaterevision(); stop()
      events.forEach(event => window.removeEventListener(event, refresh))
    }
  }, [reload, invalidaterevision])
  return { tables, areas, loading, error, reload }
}
export const STATUS_COLOR: Record<TableStatus, string> = {
  empty: 'bg-table-empty text-white',
  serving: 'bg-table-serving text-white',
  awaiting_payment: 'bg-table-payment text-white',
  needs_cleanup: 'bg-table-cleanup text-white',
}
export const STATUS_LABEL: Record<TableStatus, string> = {
  empty: 'Trống',
  serving: 'Đang phục vụ',
  awaiting_payment: 'Chờ thanh toán',
  needs_cleanup: 'Chờ dọn',
}
