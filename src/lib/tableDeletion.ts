import { supabase } from '@/integrations/supabase/client'

export async function deleteEmptyTable(id: string): Promise<void> {
  const { data: table, error: tableError } = await supabase.from('restaurant_tables')
    .select('status, merged_group_id').eq('id', id).maybeSingle()
  if (tableError) throw tableError
  if (!table) throw new Error('Bàn không còn tồn tại, vui lòng tải lại sơ đồ.')
  if (table.status !== 'empty' || table.merged_group_id) {
    throw new Error('Không thể xóa bàn đang hoạt động hoặc đang ghép nhóm.')
  }
  const { count: groups, error: groupError } = await supabase.from('table_groups')
    .select('id', { count: 'exact', head: true }).eq('primary_table_id', id)
  if (groupError) throw groupError
  if (groups === null) throw new Error('Chưa kiểm tra được nhóm bàn.')
  if (groups > 0) throw new Error('Không thể xóa bàn còn liên kết nhóm bàn.')
  // Keep every historical bill, including paid bills on a table now marked empty.
  const { count, error: orderError } = await supabase.from('orders')
    .select('id', { count: 'exact', head: true }).eq('table_id', id)
  if (orderError) throw orderError
  if (count === null) throw new Error('Chưa kiểm tra được lịch sử hóa đơn của bàn.')
  if (count > 0) throw new Error('Không thể xóa bàn đã có hóa đơn để bảo toàn lịch sử.')

  // The cloud FK RESTRICT is the final guard if another account creates an order
  // between this check and deletion. Do not catch or suppress its error.
  const { data, error } = await supabase.from('restaurant_tables').delete()
    .eq('id', id).eq('status', 'empty').is('merged_group_id', null).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('Trạng thái bàn đã thay đổi, vui lòng kiểm tra lại.')
}

export async function deleteEmptyArea(id: string): Promise<void> {
  const { data: tables, error: checkError } = await supabase.from('restaurant_tables')
    .select('id,status,merged_group_id').eq('area_id', id)
  if (checkError) throw checkError
  if (!tables) throw new Error('Chưa kiểm tra được bàn trong khu vực.')
  if (tables.some(table => table.status !== 'empty' || table.merged_group_id)) {
    throw new Error('Khu vực có bàn đang hoạt động hoặc ghép nhóm; không thể xóa.')
  }
  if (tables.length) {
    const ids = tables.map(table => table.id)
    const { count: orders, error: orderError } = await supabase.from('orders')
      .select('id', { count: 'exact', head: true }).in('table_id', ids).eq('is_paid', false)
    if (orderError) throw orderError
    if (orders === null) throw new Error('Chưa kiểm tra được đơn đang mở.')
    if (orders > 0) throw new Error('Khu vực có đơn đang mở; không thể xóa.')
    const { count: groups, error: groupError } = await supabase.from('table_groups')
      .select('id', { count: 'exact', head: true }).in('primary_table_id', ids)
    if (groupError) throw groupError
    if (groups === null) throw new Error('Chưa kiểm tra được nhóm bàn.')
    if (groups > 0) throw new Error('Khu vực còn liên kết nhóm bàn; không thể xóa.')
  }
  const { data, error } = await supabase.from('areas').delete().eq('id', id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('Khu vực đã thay đổi, vui lòng kiểm tra lại.')
}
