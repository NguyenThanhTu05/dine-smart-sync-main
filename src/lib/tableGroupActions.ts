import { supabase } from '@/integrations/supabase/client'
import { readableError,releaseTables } from '@/lib/restaurantTransactions'
import { toast } from '@/lib/notifications'
export async function unmergeGroup(groupId: string) {
  try {
    const { data, error } = await supabase.from('restaurant_tables').select('id').eq('merged_group_id', groupId).limit(1).maybeSingle()
    if (error) throw error
    if (!data) throw new Error('Nhóm bàn đã thay đổi.')
    await releaseTables(data.id, false)
    toast.success('Đã tách nhóm bàn thành công')
  } catch (error: unknown) { toast.error(readableError(error)); throw error }
}
