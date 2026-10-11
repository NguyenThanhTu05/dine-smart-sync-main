import { expect, it, vi } from 'vitest';
import { loadPaidReport } from '../../supabase/functions/_shared/loadPaidReport';
import { paidSales } from '../../supabase/functions/_shared/paidSales';
it('pages invoices and legacy items independently without recalculating historical money', async () => {
  const orders = Array.from({ length: 1001 }, (_, i) => ({ id: String(i), payment_snapshot: null, total: 123 }));
  const items = Array.from({ length: 1201 }, (_, i) => ({ order_id: '0', menu_item_id: 'menu', name_snapshot: 'Món cũ', quantity: i === 1200 ? 2 : 1 }));
  const result = await loadPaidReport(
    async (offset, last) => ({ data: orders.slice(offset, last + 1), error: null }),
    async (ids, offset, last) => ({ data: items.filter(item => ids.includes(item.order_id)).slice(offset, last + 1), error: null }),
  );
  expect(result).toHaveLength(1001);
  expect(paidSales(result)[0].qty).toBe(1202);
  expect(result[0].payment_snapshot).toBeNull();
  expect(result[0].total).toBe(123);
  expect(orders[0]).not.toHaveProperty('order_items');
});
it('uses frozen snapshots without querying their mutable item relations', async () => {
  const snapshot = { version: 1, total: 42, items: [{ menu_item_id: 'm', name_snapshot: 'Snapshot', quantity: 3 }] };
  const items = vi.fn();
  const rows = await loadPaidReport(async () => ({ data: [{ id: 'paid', payment_snapshot: snapshot }], error: null }), items);
  expect(items).not.toHaveBeenCalled();
  expect(rows[0].payment_snapshot).toBe(snapshot);
  expect(paidSales(rows)[0].qty).toBe(3);
});
it('rejects a failed legacy item page instead of presenting partial sales totals', async () => {
  await expect(loadPaidReport(async () => ({ data: [{ id: 'legacy', payment_snapshot: null }], error: null }), async () => ({ data: null, error: { message: 'server failure' } }))).rejects.toThrow('server failure');
});
