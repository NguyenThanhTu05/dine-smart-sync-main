import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/integrations/supabase/client'
 
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
  const reloadRef = useRef<() => Promise<void>>()
 
  const reload = useCallback(async () => {
    const [{ data: t }, { data: a }] = await Promise.all([
      supabase.from('restaurant_tables')
        .select('*')
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true }),
      supabase.from('areas')
        .select('*')
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true }),
    ])
    setTables((t ?? []) as RestaurantTable[])
    setAreas((a ?? []) as Area[])
    setLoading(false)
  }, [])
 
  reloadRef.current = reload
 
  const applyStatusPatch = useCallback((ids: string[], status: TableStatus) => {
    setTables(prev => prev.map(t => ids.includes(t.id) ? { ...t, status } : t))
  }, [])
 
  useEffect(() => {
    reloadRef.current?.()
 
    // Channel 1: postgres_changes — unique name để tránh conflict
    const pgChannel = supabase
      .channel(`tables-pg-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, () => reloadRef.current?.())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'areas' }, () => reloadRef.current?.())
      .subscribe()
 
    // Channel 2: broadcast — TÊN CỐ ĐỊNH, chỉ tạo 1 lần ở đây
    // useGlobalCounts không tạo channel này nữa → không còn conflict
    const broadcastChannel = supabase
      .channel('tables-broadcast-only')
      .on('broadcast', { event: 'table-status-changed' }, ({ payload }) => {
        const { ids, status } = payload as { ids: string[]; status: TableStatus }
        // Patch UI ngay
        applyStatusPatch(ids, status)
        //  Dispatch window event để useGlobalCounts (trên cùng client B/C) cũng reload badge
        window.dispatchEvent(
          new CustomEvent('table-status-changed-local', { detail: { ids, status } })
        )
      })
      .on('broadcast', { event: 'table-layout-changed' }, () => {
        reloadRef.current?.()
      })
      .subscribe()
 
    // Local window event: A tự patch cho chính mình ngay sau updateGroupStatus
    const handleLocalStatusChange = (e: Event) => {
      const { ids, status } = (e as CustomEvent<{ ids: string[]; status: TableStatus }>).detail
      applyStatusPatch(ids, status)
    }
 
    const handleLegacySync = (e: Event) => {
      const { groupIds, nextStatus } = (e as CustomEvent).detail || {}
      if (groupIds && nextStatus) applyStatusPatch(groupIds, nextStatus)
    }
 
    const handleReload = () => reloadRef.current?.()
 
    window.addEventListener('table-status-changed-local', handleLocalStatusChange)
    window.addEventListener('sync-group-status', handleLegacySync)
    window.addEventListener('tables-need-reload', handleReload)
 
    return () => {
      supabase.removeChannel(pgChannel)
      supabase.removeChannel(broadcastChannel)
      window.removeEventListener('table-status-changed-local', handleLocalStatusChange)
      window.removeEventListener('sync-group-status', handleLegacySync)
      window.removeEventListener('tables-need-reload', handleReload)
    }
  }, [applyStatusPatch])
 
  return { tables, areas, loading, reload }
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
 