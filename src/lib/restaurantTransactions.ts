import { supabase } from '@/integrations/supabase/client'
import type { Json } from '@/integrations/supabase/types'
import { paymentQuoteSchema,type PaymentQuote } from '@/lib/invoiceAmounts'
import { notifyOrderChanges } from '@/lib/orderSync'
import { getSharedBroadcastChannel } from '@/lib/tableGroup'
export type { PaymentQuote } from '@/lib/invoiceAmounts'

// No client-write fallback: a missing RPC must fail clearly, never revert to
// the old multi-request financial mutations during a partial deployment.
export async function quoteOrder(orderId: string): Promise<PaymentQuote> {
  const { data, error } = await supabase.rpc('restaurant_quote', { p_order: orderId })
  if (error) throw error
  return paymentQuoteSchema.parse(data)
}

export function announceRestaurantChange() {
  notifyOrderChanges()
  window.dispatchEvent(new CustomEvent('tables-need-reload'))
  void getSharedBroadcastChannel().send({ type: 'broadcast', event: 'table-layout-changed', payload: {} })
}

export async function submitOrder(tableId: string, lines: { menu_item_id: string; quantity: number; notes: string | null }[], notes: string, requestId: string) {
  const { data, error } = await supabase.rpc('restaurant_submit_order', {
    p_table: tableId, p_lines: lines, p_notes: notes, p_request: requestId,
  })
  if (error) throw error
  announceRestaurantChange()
  return data
}

export async function payOrder(orderId: string, action: 'request_qr' | 'confirm_qr' | 'confirm_cash', fingerprint: string) {
  const { data, error } = await supabase.rpc('restaurant_payment', { p_order: orderId, p_action: action, p_fingerprint: fingerprint })
  if (error) throw error
  const result = paymentQuoteSchema.parse(data)
  announceRestaurantChange()
  return result
}

export async function mergeTables(sourceId: string, targetId: string) {
  const { error } = await supabase.rpc('restaurant_merge', { p_source: sourceId, p_target: targetId })
  if (error) throw error
  announceRestaurantChange()
}

export async function releaseTables(tableId: string, cleanup: boolean) {
  const { data, error } = await supabase.rpc('restaurant_release', { p_table: tableId, p_cleanup: cleanup })
  if (error) throw error
  announceRestaurantChange()
  return data
}

export async function changeItem(itemId: string, action: 'start' | 'finish' | 'serve' | 'cancel') {
  const { error } = await supabase.rpc('restaurant_item', { p_item: itemId, p_action: action })
  if (error) throw error
  announceRestaurantChange()
}

export async function adjustOrder(orderId: string, action: 'discount' | 'return', value: Json, reason: string) {
  const { error } = await supabase.rpc('restaurant_adjust', { p_order: orderId, p_action: action, p_value: value, p_reason: reason })
  if (error) throw error
  announceRestaurantChange()
}

export function readableError(error: unknown) {
  return error instanceof Error ? error.message : typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : 'Không thể thực hiện thao tác.'
}
