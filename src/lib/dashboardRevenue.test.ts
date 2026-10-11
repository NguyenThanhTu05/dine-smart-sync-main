import { describe, expect, it } from 'vitest'
import { dashboardRevenue } from './dashboardRevenue'

const snapshot = { version: 1, order_id: 'order', fingerprint: 'frozen', subtotal: 10000,
  service_percent: 10, service_fee: 1000, vat_percent: 8, vat_fee: 880,
  discount_percent: 5, discount_amount: 594, total: 11286, table_name: 'A', staff_name: 'Test',
  items: [], payment_method: 'cash', paid_at: '2026-10-09T00:00:00Z', cashier_name: 'Test' }
const anchor = new Date(2026, 9, 10)
const old = { total: 10000, payment_snapshot: null, paid_at: '2026-10-09T17:30:00Z' }

describe('dashboard original historical amounts', () => {
  it('combines original legacy money and frozen new totals without mutating records', () => {
    const orders = [old, { ...old, total: 999999, payment_snapshot: snapshot }]
    const before = structuredClone(orders)
    const report = dashboardRevenue(orders, anchor, 'day')
    expect(report.totalRevenue).toBe(21286)
    expect(report.legacyCount).toBe(1)
    expect(report.chartSeries[0]).toMatchObject({ revenue: 21286, orders: 2 })
    expect(orders).toEqual(before)
  })
  it.each([['week', 5], ['month', 9], ['year', 9]] as const)('uses Vietnam dates for %s charts', (period, bucket) => {
    expect(dashboardRevenue([old], anchor, period).chartSeries[bucket].revenue).toBe(10000)
  })
  it('never invents a payment date for undated history', () => {
    const report = dashboardRevenue([{ ...old, paid_at: null }], anchor, 'day')
    expect(report.totalRevenue).toBe(10000)
    expect(report.chartSeries.every(point => point.orders === 0)).toBe(true)
  })
  it('does not silently replace a corrupted snapshot with a subtotal', () => {
    expect(dashboardRevenue([{ ...old, payment_snapshot: { total: 1 } }], anchor, 'day').totalRevenue).toBeNull()
  })
  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('does not report invalid historical money %s', total => {
    expect(dashboardRevenue([{ ...old, total }], anchor, 'day').totalRevenue).toBeNull()
  })
  it('keeps legitimate zero values and empty reports numeric', () => {
    expect(dashboardRevenue([{ ...old, total: 0 }], anchor, 'day').totalRevenue).toBe(0)
    expect(dashboardRevenue([], anchor, 'day').totalRevenue).toBe(0)
  })
})
