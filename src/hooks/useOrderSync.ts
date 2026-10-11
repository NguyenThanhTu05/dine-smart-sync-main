import { subscribeOrderChanges } from '@/lib/orderSync'
import { useEffect,useRef } from 'react'

export function useOrderSync(reload: (canCommit: () => boolean) => void | Promise<void>, scope?: string | null) {
  const reloadRef = useRef(reload)
  reloadRef.current = reload

  useEffect(() => {
    let active = true
    let running = false
    let pending = false
    // Serialize refreshes so an older response cannot overwrite a newer change.
    const refresh = async () => {
      pending = true
      if (running) return
      running = true
      try {
        while (active && pending) {
          pending = false
          try { await reloadRef.current(() => active) }
          catch (error) { console.error('Không thể cập nhật dữ liệu đơn hàng', error) }
        }
      } finally {
        running = false
      }
    }
    const unsubscribe = subscribeOrderChanges(() => { void refresh() })
    const onFocus = () => { void refresh() }
    window.addEventListener('focus', onFocus)
    void refresh()
    return () => { active = false; unsubscribe(); window.removeEventListener('focus', onFocus) }
  }, [scope])
}
