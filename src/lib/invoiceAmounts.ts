import { z } from 'zod';

export const paymentQuoteSchema = z.object({
  version: z.literal(1), order_id: z.string(), fingerprint: z.string(),
  subtotal: z.number().nonnegative(), service_percent: z.number(), service_fee: z.number().nonnegative(),
  vat_percent: z.number(), vat_fee: z.number().nonnegative(), discount_percent: z.number(),
  table_discount_percent: z.number().optional(), global_discount_percent: z.number().optional(), discount_source: z.enum(['table','global']).optional(),
  discount_amount: z.number().nonnegative(), total: z.number().nonnegative(),
  table_name: z.string().nullable(), staff_name: z.string().nullable(),
  items: z.array(z.object({ id: z.string(), menu_item_id: z.string().nullable().optional(), name_snapshot: z.string(), price_snapshot: z.number(), quantity: z.number(), notes: z.string().nullable(), status: z.enum(['pending','cooking','done','served']), no_cook: z.boolean() })),
  payment_method: z.enum(['cash', 'qr']).optional(), paid_at: z.string().optional(), cashier_name: z.string().optional(),
})
export type PaymentQuote = z.infer<typeof paymentQuoteSchema>

type OrderAmountsInput = { is_paid: boolean; total: number; discount_percent?: number | null; payment_snapshot?: unknown; order_items?: { price_snapshot: number; quantity: number }[] }
type Settings = { service_percent: number; vat_percent: number; global_discount_percent: number }

export function invoiceAmounts(order: OrderAmountsInput, settings: Settings) {
  if (order.is_paid) {
    const parsed = paymentQuoteSchema.safeParse(order.payment_snapshot)
    if (parsed.success) return { ...parsed.data, source: 'snapshot' as const }
    // Do not reconstruct old final amounts from today's settings, or present
    // the stored subtotal as if it were the amount actually collected.
    return { source: 'legacy' as const, subtotal: Number(order.total), total: null,
      service_percent: 0, service_fee: 0, vat_percent: 0, vat_fee: 0, discount_percent: 0, discount_amount: 0 }
  }
  const subtotal = (order.order_items ?? []).reduce((sum,it)=>sum+Number(it.price_snapshot)*Number(it.quantity),0)
  const service_fee = Math.round(subtotal*settings.service_percent/100)
  const vat_fee = Math.round((subtotal+service_fee)*settings.vat_percent/100)
  const discount_percent = (order.discount_percent ?? 0)>0 ? Number(order.discount_percent) : settings.global_discount_percent
  const discount_amount = Math.round((subtotal+service_fee+vat_fee)*discount_percent/100)
  return { source: 'preview' as const, subtotal, service_fee, vat_fee, discount_percent, discount_amount,
    service_percent: settings.service_percent, vat_percent: settings.vat_percent, total: subtotal+service_fee+vat_fee-discount_amount }
}

// Historical display only; never treat a stored subtotal as a verified collected total.
export function billDisplayAmount(order: OrderAmountsInput, settings: Settings) {
  const amounts = invoiceAmounts(order, settings)
  const original = order.is_paid && order.payment_snapshot == null
    && Number.isFinite(order.total) && order.total >= 0
  return { value: original ? order.total : amounts.total, usesStoredAmount: original }
}
