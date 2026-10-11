vi.mock('@/lib/readOrderItems', () => ({ readOrderItems: async () => new Map() }))
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest'
import { printBill } from './printBill'
const mock = vi.hoisted(() => ({ order: {} as Record<string, unknown>, quote: vi.fn(), error: vi.fn(), orderError: null as Error | null }))
vi.mock('@/lib/restaurantTransactions', () => ({ quoteOrder: mock.quote, readableError: (e: Error) => e.message }))
vi.mock('sonner', () => ({ toast: { error: mock.error } }))
vi.mock('@/lib/formatVND', () => ({ formatVND: (v: number) => `VND:${v}` }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  rpc: vi.fn(async () => ({ data: [] })),
  from: (table: string) => {
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ error: table === 'orders' ? mock.orderError : null, data: table === 'orders' ? mock.order : table === 'payment_settings' ? {
      vat_percent: 99, service_percent: 99, global_discount_percent: 99,
    } : { merged_group_id: null } }) }
    return q
  },
} }))
const snapshot = { version: 1, order_id: 'order', fingerprint: 'frozen', subtotal: 10000,
  service_percent: 10, service_fee: 1000, vat_percent: 8, vat_fee: 880,
  discount_percent: 5, discount_amount: 594, total: 11286, table_name: 'Original tables', staff_name: 'Original server',
  items: [], payment_method: 'cash', paid_at: '2026-10-09T00:00:00Z', cashier_name: 'Original cashier' }
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); mock.orderError = null
  mock.order = { id: 'order', table_id: 'table', is_paid: true, total: 10000, payment_snapshot: snapshot, order_items: [], restaurant_tables: { name: 'Renamed table' }, payment_method: 'cash' }
})
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); document.body.innerHTML = '' })
const printed = () => document.querySelector('iframe')?.contentDocument?.documentElement.outerHTML ?? ''
describe('printing financial history', () => {
  it('does not silently succeed or print partial data when the server rejects reading the bill', async () => {
    mock.orderError = new Error('Read denied')
    await printBill('order')
    expect(document.querySelector('iframe')).toBeNull()
    expect(mock.error).toHaveBeenCalledWith('Read denied')
  })
  it('prints the frozen money, table and cashier and ignores a method override for paid invoices', async () => {
    await printBill('order', { overridePaymentMethod: 'qr' })
    expect(printed()).toContain('VND:11286')
    expect(printed()).toContain('VAT (8%)')
    expect(printed()).toContain('Original tables')
    expect(printed()).toContain('Original cashier')
    expect(printed()).toContain('Tiền mặt')
    expect(printed()).not.toContain('VAT (99%)')
    expect(mock.quote).not.toHaveBeenCalled()
  })
  it('preserves a legacy subtotal but does not fabricate the amount collected', async () => {
    mock.order.payment_snapshot = null
    await printBill('order')
    expect(printed()).toContain('VND:10000')
    expect(printed()).toContain('TỔNG THANH TOÁN</span><span>—')
    expect(printed()).not.toContain('VAT (99%)')
  })
  it('uses a server quote for an unpaid bill and fails without printing if it cannot verify it', async () => {
    mock.order.is_paid = false; mock.order.payment_snapshot = null
    mock.quote.mockRejectedValue(new Error('Cannot verify bill'))
    await printBill('order')
    expect(document.querySelector('iframe')).toBeNull()
    expect(mock.error).toHaveBeenCalledWith('Cannot verify bill')
    mock.quote.mockResolvedValue(snapshot)
    await printBill('order')
    expect(printed()).toContain('VND:11286')
  })
})
