import { useRef, type PointerEvent } from 'react'
import { reduced } from '@/lib/motion'

/** Horizontal dismissal is confined to a visible panel header; vertical content scroll stays native. */
export function useDismissGesture(close: () => void) {
  const gesture = useRef<{ x: number; y: number; pane: HTMLElement; distance: number; locked: boolean } | null>(null)
  const reset = () => {
    const state = gesture.current
    if (state) {
      const from = state.pane.style.translate || '0 0'
      state.pane.style.removeProperty('translate')
      if (!reduced()) state.pane.animate([{ translate: from }, { translate:'0 0' }], { duration:200, easing:'cubic-bezier(.22,1,.36,1)' })
    }
    gesture.current = null
  }
  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'touch' || event.clientX < 24 || (event.target as Element).closest('button,input,a')) return
      const pane = event.currentTarget.closest<HTMLElement>('.premium-ai,.receipt-preview')
      if (pane) gesture.current = { x:event.clientX, y:event.clientY, pane, distance:0, locked:false }
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const state = gesture.current
      if (!state) return
      const x = event.clientX-state.x, y = event.clientY-state.y
      if (!state.locked && Math.abs(y)>12 && Math.abs(y)>Math.abs(x)) { gesture.current=null; return }
      if (Math.abs(x)>12 && Math.abs(x)>Math.abs(y)) {
        state.locked=true; event.currentTarget.setPointerCapture(event.pointerId)
        state.distance=x
        if (!reduced()) state.pane.style.translate=`${Math.max(-96,Math.min(96,x*.65))}px 0`
      }
    },
    onPointerUp: () => { const dismiss = gesture.current?.locked && Math.abs(gesture.current.distance)>80; reset(); if (dismiss) close() },
    onPointerCancel: reset,
  }
}
