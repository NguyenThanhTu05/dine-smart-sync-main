import { describe,expect,it } from 'vitest'
import { billDisplayAmount, invoiceAmounts } from './invoiceAmounts'

const settings = { vat_percent: 8, service_percent: 10, global_discount_percent: 5 }
const snapshot = { version: 1, order_id: 'order', fingerprint: 'frozen', subtotal: 10000,
  service_percent: 10, service_fee: 1000, vat_percent: 8, vat_fee: 880,
  discount_percent: 5, discount_amount: 594, total: 11286, table_name: 'A + B', staff_name: 'Test',
  items: [], payment_method: 'cash', paid_at: '2026-10-09T00:00:00Z', cashier_name: 'Test cashier' }

describe('settled and legacy invoice amounts', () => {
  it('uses frozen money even if fees, discount, current items and stored subtotal differ', () => {
    const result = invoiceAmounts({ is_paid: true, total: 999999, discount_percent: 99, payment_snapshot: snapshot,
      order_items: [{ price_snapshot: 1, quantity: 1 }] }, { vat_percent: 99, service_percent: 99, global_discount_percent: 99 })
    expect(result.total).toBe(11286)
    expect(result.subtotal).toBe(10000)
    expect(result.vat_percent).toBe(8)
  })

  it('keeps the original legacy subtotal and treats the collected amount as unknown without mutating input', () => {
    const original = { is_paid: true, total: 123456, payment_snapshot: null, discount_percent: 20 }
    const before = structuredClone(original)
    const result = invoiceAmounts(original, settings)
    expect(result).toMatchObject({ source: 'legacy', subtotal: 123456, total: null, vat_fee: 0, service_fee: 0 })
    expect(original).toEqual(before)
    expect(invoiceAmounts(original, { vat_percent: 99, service_percent: 99, global_discount_percent: 99 })).toEqual(result)
  })

  it('never reconstructs a paid total from a malformed snapshot', () => {
    expect(invoiceAmounts({ is_paid: true, total: 10000, payment_snapshot: { version: 1, total: 1 } }, settings).total).toBeNull()
  })

  it('keeps the existing fee order and per-table discount precedence for an unpaid preview', () => {
    expect(invoiceAmounts({ is_paid: false, total: 0, discount_percent: 10, order_items: [{ price_snapshot: 10000, quantity: 1 }] }, settings))
      .toMatchObject({ source: 'preview', subtotal: 10000, service_fee: 1000, vat_fee: 880, discount_amount: 1188, total: 10692 })
  })
})

describe('historical Bill Order display', () => {
  it('shows original stored money without changing the unknown collected amount', () => {
    const order = { is_paid: true, total: 35000, payment_snapshot: null }
    expect(billDisplayAmount(order, settings)).toEqual({ value: 35000, usesStoredAmount: true })
    expect(invoiceAmounts(order, settings).total).toBeNull()
  })
  it('uses the frozen total for a new paid bill', () => {
    expect(billDisplayAmount({ is_paid: true, total: 999999, payment_snapshot: snapshot }, settings))
      .toEqual({ value: 11286, usesStoredAmount: false })
  })
  it('does not mask a corrupt snapshot', () => {
    expect(billDisplayAmount({ is_paid: true, total: 35000, payment_snapshot: { total: 1 } }, settings).value).toBeNull()
  })
  it('preserves an unpaid preview', () => {
    const order = { is_paid: false, total: 999, order_items: [{ price_snapshot: 10000, quantity: 1 }] }
    expect(billDisplayAmount(order, settings).value).toBe(invoiceAmounts(order, settings).total)
  })
  it.each([-1, Number.NaN, Infinity])('rejects invalid original money %s', total => {
    expect(billDisplayAmount({ is_paid: true, total }, settings).value).toBeNull()
  })
})
