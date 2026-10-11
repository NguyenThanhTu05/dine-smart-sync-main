type Item = { menu_item_id?: string | null; name_snapshot: string; quantity: number }
type PaidOrder = { is_paid?: boolean; payment_snapshot?: unknown; order_items?: Item[] }
// Callers select paid orders using paid_at, rather than item creation time.
export function paidSales(orders: PaidOrder[]) {
  const grouped = new Map<string,{menu_item_id: string | null; name: string; qty: number}>()
  for (const order of orders) {
    if (order.is_paid === false) continue
    const snapshot = order.payment_snapshot as {version?: number; items?: Item[]} | null
    const items = snapshot?.version === 1 && Array.isArray(snapshot.items) ? snapshot.items : order.order_items ?? []
    for (const item of items) {
      if (!Number.isSafeInteger(item.quantity) || item.quantity<=0 || typeof item.name_snapshot!=='string') throw new Error('Số liệu món bán không hợp lệ, cần đối soát')
      const id = item.menu_item_id ?? null
      const key = JSON.stringify([id,item.name_snapshot])
      grouped.set(key,{menu_item_id:id,name:item.name_snapshot,qty:(grouped.get(key)?.qty ?? 0)+item.quantity})
    }
  }
  return [...grouped.values()].sort((a,b)=>b.qty-a.qty)
}
