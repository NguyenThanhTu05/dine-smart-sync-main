export function readCollectedTotal(snapshot: unknown): number | null {
  if (typeof snapshot !== 'object' || snapshot === null || !('version' in snapshot) || snapshot.version !== 1 || !('total' in snapshot)) return null
  return typeof snapshot.total === 'number' && Number.isFinite(snapshot.total) && snapshot.total >= 0 ? snapshot.total : null
}

export function summarizePaidRevenue(orders: { payment_snapshot?: unknown }[]) {
  const values = orders.map(o => readCollectedTotal(o.payment_snapshot))
  const legacy_count = values.filter(v => v === null).length
  const known_revenue = values.reduce<number>((sum,v) => sum+(v ?? 0),0)
  return { total_revenue: legacy_count ? null : known_revenue, known_revenue, legacy_count,
    reconciliation_note: legacy_count ? 'Hóa đơn cũ thiếu dữ liệu chốt; không tính lại theo cấu hình hiện tại.' : null }
}
