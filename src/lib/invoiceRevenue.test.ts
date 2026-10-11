import { describe,expect,it } from 'vitest'
import { summarizePaidRevenue } from '../../supabase/functions/_shared/invoiceRevenue'
describe('assistant revenue without historical assumptions', () => {
  it('reports an incomplete aggregate and known money separately when legacy invoices exist', () => {
    expect(summarizePaidRevenue([{ payment_snapshot: { version: 1, total: 12000 } }, { payment_snapshot: null }]))
      .toMatchObject({ total_revenue: null, known_revenue: 12000, legacy_count: 1 })
  })
  it('sums settled amounts and treats invalid money as unknown', () => {
    expect(summarizePaidRevenue([{ payment_snapshot: { version: 1, total: 12000 } }, { payment_snapshot: { version: 1, total: 3000 } }]).total_revenue).toBe(15000)
    expect(summarizePaidRevenue([{ payment_snapshot: { version: 1, total: NaN } }]).total_revenue).toBeNull()
    expect(summarizePaidRevenue([{ payment_snapshot: { version: 1, total: -1 } }]).total_revenue).toBeNull()
  })
})
