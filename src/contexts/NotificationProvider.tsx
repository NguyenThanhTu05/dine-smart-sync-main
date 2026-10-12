import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from './authState'
import { NotificationContext } from './notificationState'
import { supabase } from '@/integrations/supabase/client'
import { emptyCounts, loadNotificationCounts } from '@/lib/notificationCounts'
import { subscribeOrderChanges } from '@/lib/orderSync'
import { subscribeTableChanges } from '@/lib/tableSync'

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user, role, isRecovery } = useAuth()
  const identity = user?.id && role && !isRecovery ? `${user.id}:${role}` : null
  const [state, setState] = useState({ identity: null as string | null, ...emptyCounts(), readyError: false })
  useEffect(() => {
    if (!identity || !role) return
    let active = true, running = false, pending = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = async () => {
      timer = undefined
      if (!active || running) return
      running = true; pending = false
      try {
        const result = await loadNotificationCounts(role)
        if (active && !pending) setState(previous => ({
          ...(previous.identity === identity ? previous : emptyCounts()),
          identity, ...result.counts, readyError: result.readyFailed,
        }))
      } catch {
        if (active) setState(previous => ({ ...(previous.identity === identity ? previous : emptyCounts()), identity, tableAlerts: 0, readyByTable: {}, readyError: role !== 'kitchen' }))
      } finally {
        running = false
        if (active && pending) schedule()
      }
    }
    const schedule = () => {
      if (!active) return
      pending = true
      if (!running && timer === undefined) timer = setTimeout(() => { void refresh() }, 100)
    }
    const stopOrders = subscribeOrderChanges(schedule)
    const stopTables = role !== 'kitchen' ? subscribeTableChanges(schedule) : undefined
    const stock = role === 'admin' ? supabase.channel(`counts-stock-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredients' }, schedule)
      .subscribe(status => { if (status === 'SUBSCRIBED') schedule() }) : undefined
    const events = ['focus', 'online', 'table-status-changed-local', 'sync-group-status', 'tables-need-reload', 'ingredients-changed']
    events.forEach(event => window.addEventListener(event, schedule))
    const onVisible = () => { if (!document.hidden) schedule() }
    document.addEventListener('visibilitychange', onVisible)
    if (timer !== undefined) clearTimeout(timer)
    void refresh()
    return () => {
      active = false
      if (timer !== undefined) clearTimeout(timer)
      stopOrders(); stopTables?.()
      if (stock) void supabase.removeChannel(stock)
      events.forEach(event => window.removeEventListener(event, schedule))
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [identity, role])
  const value = state.identity === identity ? state : { ...emptyCounts(), readyError: false }
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
}
