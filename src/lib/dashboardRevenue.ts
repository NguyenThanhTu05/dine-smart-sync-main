import { paymentQuoteSchema } from './invoiceAmounts'
import { vietnamParts } from '../../supabase/functions/_shared/vietnamTime'

type RevenueOrder = { total: number; payment_snapshot?: unknown; paid_at: string | null }
type Period = 'day' | 'week' | 'month' | 'year'
export type RevenuePoint = { dateLabel: string; revenue: number | null; orders: number }

// Display the original stored amount for old invoices, without reconstructing
// historical fees or changing the invoice's unknown collected total.
export function dashboardRevenue<T extends RevenueOrder>(orders: readonly T[], anchor: Date, period: Period) {
  const paidOrders = orders.map(order => {
    const snapshot = paymentQuoteSchema.safeParse(order.payment_snapshot)
    const legacy = order.payment_snapshot == null
    const stored = Number.isFinite(order.total) && order.total >= 0 ? order.total : null
    return { ...order, reportedTotal: snapshot.success ? snapshot.data.total : legacy ? stored : null,
      usesStoredAmount: legacy && stored !== null }
  })
  const legacyCount = paidOrders.filter(order => order.usesStoredAmount).length
  const totalRevenue = paidOrders.some(order => order.reportedTotal === null) ? null
    : paidOrders.reduce((sum, order) => sum + (order.reportedTotal ?? 0), 0)
  const week = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'CN']
  const length = period === 'day' ? 24 : period === 'week' ? 7
    : period === 'month' ? new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate() : 12
  const chartSeries: RevenuePoint[] = Array.from({ length }, (_, index) => ({
    dateLabel: period === 'day' ? `${index}h` : period === 'week' ? week[index]
      : period === 'month' ? `N${index + 1}` : `Th ${index + 1}`,
    revenue: 0, orders: 0,
  }))
  for (const order of paidOrders) {
    // A missing historical payment date must not be assigned an invented day.
    if (!order.paid_at) continue
    const time = vietnamParts(order.paid_at)
    const index = period === 'day' ? time.hour : period === 'week' ? (time.day === 0 ? 6 : time.day - 1)
      : period === 'month' ? time.date - 1 : time.month
    const point = chartSeries[index]
    if (!point) continue
    point.revenue = point.revenue === null || order.reportedTotal === null ? null : point.revenue + order.reportedTotal
    point.orders++
  }
  return { paidOrders, legacyCount, totalRevenue, chartSeries }
}
