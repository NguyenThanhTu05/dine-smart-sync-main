import { Badge } from '@/components/ui/badge'
import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'

export function useGlobalCounts() {
  const [tableAlerts, setTableAlerts] = useState(0)
  const [kitchenPending, setKitchenPending] = useState(0)
  const [openBills, setOpenBills] = useState(0)
  const [lowStock, setLowStock] = useState(0)

  const reload = async () => {
    const [{ count: c1 }, { count: c2 }, { count: c3 }, { data: ingData }] = await Promise.all([
      supabase.from('restaurant_tables').select('*', { head: true, count: 'exact' }).eq('status', 'awaiting_payment'),
      supabase.from('order_items').select('id, orders!inner(is_paid)', { head: true, count: 'exact' }).in('status', ['pending', 'cooking']).eq('orders.is_paid', false),
      supabase.from('orders').select('*', { head: true, count: 'exact' }).eq('is_paid', false),
      supabase.from('ingredients').select('stock, min_stock'),
    ])
    setTableAlerts(c1 ?? 0)
    setKitchenPending(c2 ?? 0)
    setOpenBills(c3 ?? 0)
    setLowStock((ingData ?? []).filter((r: any) => r.stock < r.min_stock).length)
  }

  useEffect(() => {
    reload()

    const pgChannel = supabase
      .channel(`counts-pg-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredients' }, reload)
      .subscribe()

    const handleStatusChange = () => reload()
    window.addEventListener('table-status-changed-local', handleStatusChange)

    const handleIngredients = (e: any) => setLowStock(e.detail.lowStock)
    window.addEventListener('ingredients-changed', handleIngredients)

    return () => {
      supabase.removeChannel(pgChannel)
      window.removeEventListener('table-status-changed-local', handleStatusChange)
      window.removeEventListener('ingredients-changed', handleIngredients)
    }
  }, [])

  return { tableAlerts, kitchenPending, openBills, lowStock }
}

export function NumberBadge({ n }: { n: number }) {
  if (!n) return null
  return (
    <Badge
      className="absolute top-0 right-0 translate-x-1/3 -translate-y-1/3 h-5 min-w-5 flex items-center justify-center rounded-full bg-orange-500 hover:bg-orange-500 px-1 text-[11px] font-extrabold text-white tabular-nums border-none shadow-sm z-10"
    >
      {n > 99 ? '99+' : n}
    </Badge>
  )
}

export const formatVND = (n: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n)