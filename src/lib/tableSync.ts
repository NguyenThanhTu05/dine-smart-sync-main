import { supabase } from '@/integrations/supabase/client'

const listeners = new Set<() => void>()
let channel: ReturnType<typeof supabase.channel> | undefined
let sends = 0
const notify = () => { listeners.forEach(listener => listener()) }
function acquire() {
  if (!channel) channel = supabase.channel('tables-broadcast-only')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, notify)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'areas' }, notify)
    .on('broadcast', { event: 'table-layout-changed' }, notify)
    .on('broadcast', { event: 'table-status-changed' }, notify)
    .subscribe(status => { if (status === 'SUBSCRIBED') notify() })
  return channel
}
function release() {
  if (!listeners.size && !sends && channel) {
    const old = channel; channel = undefined
    void supabase.removeChannel(old)
  }
}
export function subscribeTableChanges(listener: () => void) {
  listeners.add(listener); acquire()
  return () => { listeners.delete(listener); release() }
}
// Sender and readers share one owner; a component cannot remove another's topic.
export const tableBroadcaster = {
  async send(message: Parameters<ReturnType<typeof supabase.channel>['send']>[0]) {
    sends++
    try { return await acquire().send(message) } finally { sends--; notify(); release() }
  },
}
