import { useOrderSync } from '@/hooks/useOrderSync'
import { supabase } from '@/integrations/supabase/client'
import { useCallback,useEffect,useRef,useState } from 'react'

export function useGlobalCounts() {
  const [tableAlerts, setTableAlerts] = useState(0)
  const [kitchenPending, setKitchenPending] = useState(0)
  const [openBills, setOpenBills] = useState(0)
  const [lowStock, setLowStock] = useState(0)

  const version = useRef(0)
  const invalidateversion = useCallback(() => { version.current++ }, [])
  const reload = async () => {
    const request = ++version.current
    try {
    const results = await Promise.all([
      supabase.from('restaurant_tables').select('*', { head: true, count: 'exact' }).eq('status', 'awaiting_payment'),
      supabase.from('order_items').select('id, orders!inner(is_paid)', { head: true, count: 'exact' }).in('status', ['pending', 'cooking']).eq('orders.is_paid', false),
      supabase.from('orders').select('*', { head: true, count: 'exact' }).eq('is_paid', false),
      supabase.from('ingredients').select('stock, min_stock'),
    ])
    if (request !== version.current) return
    const error = results.find(result => result.error)?.error
    if (error) throw error
    const [{count:c1},{count:c2},{count:c3},{data:ingData}] = results
    setTableAlerts(c1 ?? 0)
    setKitchenPending(c2 ?? 0)
    setOpenBills(c3 ?? 0)
    setLowStock((ingData ?? []).filter((r) => r.stock < r.min_stock).length)
    } catch (error) { console.error('Không cập nhật được số lượng thông báo',error) }
  }

  useOrderSync(reload)

  useEffect(() => {
    reload()

    const pgChannel = supabase
      .channel(`counts-pg-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredients' }, reload)
      .subscribe()

    const handleStatusChange = () => reload()
    window.addEventListener('table-status-changed-local', handleStatusChange)

    const handleIngredients = () => { void reload() }
    window.addEventListener('ingredients-changed', handleIngredients)

    return () => {
      invalidateversion()
      supabase.removeChannel(pgChannel)
      window.removeEventListener('table-status-changed-local', handleStatusChange)
      window.removeEventListener('ingredients-changed', handleIngredients)
    }
  }, [invalidateversion])

  return { tableAlerts, kitchenPending, openBills, lowStock }
}
