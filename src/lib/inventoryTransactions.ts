import { supabase } from '@/integrations/supabase/client'
import type { Json } from '@/integrations/supabase/types'

// Retain the key after a lost response. An explicit edit creates a different
// payload/key; a confirmed result removes it so a subsequent import is distinct.
export async function stockTransaction(action: 'create' | 'edit' | 'adjust' | 'delete', id: string | null, data: Record<string, Json | undefined>) {
  const payload = JSON.stringify({ action, id, data })
  const storageKey = 'restaurant-stock-request'
  let prior: { payload: string; id: string } | null = null
  try { prior = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null') } catch { /* invalid local cache */ }
  const requestId = prior?.payload === payload ? prior.id : crypto.randomUUID()
  sessionStorage.setItem(storageKey, JSON.stringify({ payload, id: requestId }))
  const { data: result, error } = await supabase.rpc('restaurant_stock', { p_action: action, p_id: id, p_data: data, p_request: requestId })
  if (error) throw error
  sessionStorage.removeItem(storageKey)
  window.dispatchEvent(new CustomEvent('inventory-changed'))
  return result
}
