import type { RestaurantTable } from '@/hooks/useTables'
import { readOpenOrder } from '@/lib/openOrder'
import { tableBroadcaster } from '@/lib/tableSync'
 
// Sender and table listeners share lifecycle ownership.
 
export function getSharedBroadcastChannel() {
  return tableBroadcaster
}
 
export async function findGroupOpenOrderId(table: Pick<RestaurantTable, 'id' | 'merged_group_id'>): Promise<string | null> {
  return (await readOpenOrder(table))?.id ?? null
}
