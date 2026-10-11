import type { RestaurantTable } from '@/hooks/useTables'
import { supabase } from '@/integrations/supabase/client'
import type { Tables } from '@/integrations/supabase/types'

// Resolve current group membership and read its invoice within one server lock.
export async function readOpenOrder(table: Pick<RestaurantTable, 'id' | 'merged_group_id'>) {
  const { data, error } = await supabase.rpc('restaurant_open_order', { p_table: table.id })
  if (error) throw error
  return data as (Tables<'orders'> & { order_items: Tables<'order_items'>[] }) | null
}
