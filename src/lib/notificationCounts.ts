import type { AppRole } from '@/contexts/authState'
import type { RestaurantTable } from '@/hooks/useTables'
import { supabase } from '@/integrations/supabase/client'
import { readPages } from '../../supabase/functions/_shared/readPages'

export interface NotificationCounts {
  tableAlerts: number
  kitchenPending: number
  openBills: number
  lowStock: number
  readyByTable: Record<string, number>
}
export const emptyCounts = (): NotificationCounts => ({ tableAlerts: 0, kitchenPending: 0, openBills: 0, lowStock: 0, readyByTable: {} })

async function count(query: PromiseLike<{ count: number | null; error: { message: string } | null }>) {
  const result = await query
  if (result.error) throw new Error(result.error.message)
  return result.count ?? 0
}

export async function loadNotificationCounts(role: AppRole) {
  let tableRows: Pick<RestaurantTable, 'id' | 'status' | 'merged_group_id'>[] | null = null
  const jobs: { ready?: boolean; run: () => Promise<Partial<NotificationCounts>> }[] = []
  if (role !== 'kitchen') {
    jobs.push({ ready: true, run: async () => {
      tableRows = await readPages((offset, last) => supabase.from('restaurant_tables')
        .select('id,status,merged_group_id').order('id').range(offset, last))
      return {}
    } })
    jobs.push({ ready: true, run: async () => {
      const rows = await readPages((offset, last) => supabase.from('order_items')
        .select('id,quantity,orders!inner(table_id,is_paid)').eq('status', 'done').eq('orders.is_paid', false).order('id').range(offset, last))
      const readyByTable: Record<string, number> = {}
      for (const row of rows) {
        const tableId = row.orders?.table_id
        if (tableId && !row.orders?.is_paid && Number.isInteger(row.quantity) && row.quantity > 0) readyByTable[tableId] = (readyByTable[tableId] ?? 0) + row.quantity
      }
      return { readyByTable }
    } })
  }
  if (role === 'kitchen') jobs.push({ run: async () => ({ kitchenPending: await count(supabase.from('order_items')
    .select('id,orders!inner(is_paid)', { head: true, count: 'exact' }).in('status', ['pending', 'cooking']).eq('no_cook', false).eq('orders.is_paid', false)) }) })
  if (role === 'admin' || role === 'cashier') jobs.push({ run: async () => ({ openBills: await count(supabase.from('orders').select('id', { head: true, count: 'exact' }).eq('is_paid', false)) }) })
  if (role === 'admin') jobs.push({ run: async () => {
    const rows = await readPages((offset, last) => supabase.from('ingredients').select('id,stock,min_stock').order('id').range(offset, last))
    return { lowStock: rows.filter(row => row.stock < row.min_stock).length }
  } })
  const results = await Promise.allSettled(jobs.map(job => job.run()))
  const counts: Partial<NotificationCounts> = {}
  let failed = false, readyFailed = false
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') Object.assign(counts, result.value)
    else { failed = true; if (jobs[index].ready) { readyFailed = true; counts.readyByTable = {} } }
  })
  if (role !== 'kitchen') {
    if (!tableRows) { counts.readyByTable = {}; readyFailed = true }
    counts.tableAlerts = countTableAlerts(tableRows ?? [], counts.readyByTable ?? {})
  }
  return { counts, failed, readyFailed }
}

export function countTableAlerts(tables: Pick<RestaurantTable, 'id' | 'status' | 'merged_group_id'>[], readyByTable: Record<string, number>) {
  const alerts = new Set<string>()
  for (const table of tables) {
    if (table.status === 'awaiting_payment' || table.status === 'serving' && (readyByTable[table.id] ?? 0) > 0) {
      alerts.add(table.merged_group_id ? `group:${table.merged_group_id}` : `table:${table.id}`)
    }
  }
  return alerts.size
}

export function readyCountForTable(table: Pick<RestaurantTable, 'id' | 'merged_group_id'>, tables: Pick<RestaurantTable, 'id' | 'merged_group_id'>[], counts: Record<string, number>) {
  if (!table.merged_group_id) return counts[table.id] ?? 0
  return tables.filter(peer => peer.merged_group_id === table.merged_group_id).reduce((sum, peer) => sum + (counts[peer.id] ?? 0), 0)
}
