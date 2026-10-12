import { type ReactNode, useEffect, useState } from 'react'
import { reduced } from '@/lib/motion'

/** Keeps only a closing visual mounted briefly; business state changes immediately. */
export function MotionPresence({ show, children }: { show: boolean; children: (state: 'open' | 'closed') => ReactNode }) {
  const [retained, setRetained] = useState(show)
  useEffect(() => {
    if (show) { setRetained(true); return }
    if (reduced()) { setRetained(false); return }
    const timer = window.setTimeout(() => setRetained(false), 180)
    return () => clearTimeout(timer)
  }, [show])
  return show || retained ? children(show ? 'open' : 'closed') : null
}
