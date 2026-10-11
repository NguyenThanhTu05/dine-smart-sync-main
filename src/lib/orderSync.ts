import { supabase } from '@/integrations/supabase/client';

// One shared channel per client, even when several panels listen at once.
const listeners = new Set<() => void>()
let channel: ReturnType<typeof supabase.channel> | undefined
let sends = 0
function release() {
  if (!listeners.size && !sends && channel) {
    const old = channel; channel = undefined
    void supabase.removeChannel(old)
  }
}

function reloadListeners() {
  listeners.forEach(reload => reload())
}

function getChannel() {
  if (!channel) {
    channel = supabase.channel('order-sync')
      .on('broadcast', { event: 'orders-changed' }, reloadListeners)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, reloadListeners)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, reloadListeners)
      .subscribe(status => {
        if (status === 'SUBSCRIBED') reloadListeners()
      })
  }
  return channel
}

export function subscribeOrderChanges(reload: () => void) {
  listeners.add(reload)
  getChannel()
  return () => {
    listeners.delete(reload)
    release()
  }
}

export function notifyOrderChanges() {
  reloadListeners()
  // Broadcast also covers deployments where database realtime is not enabled.
  sends++
  void Promise.resolve(getChannel().send({ type: 'broadcast', event: 'orders-changed', payload: {} }))
    .catch(error => console.error('Không gửi được thông báo đồng bộ đơn', error))
    .finally(() => { sends--; release() })
}
