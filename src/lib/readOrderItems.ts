import { readPages } from '../../supabase/functions/_shared/readPages';
import { supabase } from '@/integrations/supabase/client';
import type { OrderItem } from './domainTypes';

export async function readOrderItems(orderIds: string[]) {
  const items = new Map<string, OrderItem[]>(orderIds.map(id => [id, []]));
  for (let batch = 0; batch < orderIds.length; batch += 100) {
    const ids = orderIds.slice(batch, batch + 100);
    const data = await readPages((offset,last) => supabase.from('order_items').select('*').in('order_id',ids).order('id').range(offset,last));
    for (const item of data) {
      const rows = items.get(item.order_id);
      if (!rows) throw new Error('Món không thuộc hóa đơn đang tải');
      rows.push(item);
    }
  }
  return items;
}
