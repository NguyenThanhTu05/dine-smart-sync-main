import { supabase } from '@/integrations/supabase/client'
import { RestaurantTable, TableStatus } from '@/hooks/useTables'
 
// Channel chỉ dùng để GỬI broadcast ra các client khác
// Không dùng để lắng nghe — tránh conflict với useTables và useGlobalCounts
let _broadcastChannel: ReturnType<typeof supabase.channel> | null = null
 
export function getSharedBroadcastChannel() {
  if (!_broadcastChannel) {
    _broadcastChannel = supabase
      .channel('tables-broadcast-only')
      .subscribe()
  }
  return _broadcastChannel
}
 
export async function getGroupTableIds(table: Pick<RestaurantTable, 'id' | 'merged_group_id'>): Promise<string[]> {
  if (!table.merged_group_id) return [table.id]
  const { data } = await supabase
    .from('restaurant_tables')
    .select('id')
    .eq('merged_group_id', table.merged_group_id)
    .order('id', { ascending: true })
  const ids = (data ?? []).map((r: any) => r.id)
  return ids.length ? ids : [table.id]
}
 
export async function findGroupOpenOrderId(table: Pick<RestaurantTable, 'id' | 'merged_group_id'>): Promise<string | null> {
  const ids = await getGroupTableIds(table)
  const { data } = await supabase
    .from('orders')
    .select('id, table_id, created_at')
    .in('table_id', ids)
    .eq('is_paid', false)
    .order('created_at', { ascending: true })
 
  if (!data || data.length === 0) return null
  const primaryOrderId = data[0].id
 
  if (data.length > 1) {
    const otherOrderIds = data.slice(1).map((o: any) => o.id)
    await supabase.from('order_items').update({ order_id: primaryOrderId }).in('order_id', otherOrderIds)
    await supabase.from('orders')
      .update({ is_paid: true, total: 0, notes: 'Hóa đơn rác do gộp bàn đã được xử lý' })
      .in('id', otherOrderIds)
  }
  return primaryOrderId
}
 
export async function resolvePrimaryTableId(table: Pick<RestaurantTable, 'id' | 'merged_group_id'>): Promise<string> {
  const ids = await getGroupTableIds(table)
  const { data } = await supabase
    .from('orders')
    .select('table_id, created_at')
    .in('table_id', ids)
    .eq('is_paid', false)
    .order('created_at', { ascending: true })
    .limit(1)
  return data?.[0]?.table_id ?? ids[0] ?? table.id
}
 
export async function updateGroupStatus(
  table: Pick<RestaurantTable, 'id' | 'merged_group_id'>,
  status: TableStatus,
): Promise<string[]> {
  const ids = await getGroupTableIds(table)
 
  // 1. Cập nhật DB
  await supabase.from('restaurant_tables').update({ status }).in('id', ids)
 
  // 2. Broadcast ra các client KHÁC (B, C, ...)
  await getSharedBroadcastChannel().send({
    type: 'broadcast',
    event: 'table-status-changed',
    payload: { ids, status },
  })

  window.dispatchEvent(
    new CustomEvent('table-status-changed-local', { detail: { ids, status } })
  )
 
  return ids
}