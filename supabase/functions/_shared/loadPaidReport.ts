import { readPages } from './readPages.ts';
type ReportOrder = { id: string; payment_snapshot: unknown };
type ReportItem = { order_id: string; menu_item_id: string | null; name_snapshot: string; quantity: number };
type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

// Embedded rows have their own server row cap. Page legacy items separately;
// new invoices continue to use their immutable snapshot in paidSales.
export async function loadPaidReport<O extends ReportOrder>(
  ordersPage: (offset: number, last: number) => Page<O>,
  itemsPage: (ids: string[], offset: number, last: number) => Page<ReportItem>,
) {
  const orders = (await readPages(ordersPage)).map(order => ({ ...order, order_items: [] as ReportItem[] }));
  const legacy = orders.filter(order => {
    const snapshot = order.payment_snapshot;
    return !snapshot || typeof snapshot !== 'object' || !('version' in snapshot) || snapshot.version !== 1 || !('items' in snapshot) || !Array.isArray(snapshot.items);
  });
  const byId = new Map(legacy.map(order => [order.id, order]));
  for (let batch = 0; batch < legacy.length; batch += 100) {
    const ids = legacy.slice(batch, batch + 100).map(order => order.id);
    const rows = await readPages((offset,last) => itemsPage(ids,offset,last));
    for (const item of rows) {
      const order = byId.get(item.order_id);
      if (!order) throw new Error('Món không thuộc hóa đơn đang báo cáo');
      order.order_items.push(item);
    }
  }
  return orders;
}
