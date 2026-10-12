import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

export const motionTokens = { touch: 140, tab: 230, dialog: 280, page: 240, layout: 300, success: 520, stagger: 28, ease: 'cubic-bezier(.22,1,.36,1)', spring: 'cubic-bezier(.2,1.25,.35,1)' } as const
export const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Visual feedback only: never synthesizes a click or delays a server update.
export function touchFeedback(event: React.PointerEvent<HTMLElement>) {
  const target = event.currentTarget
  if (reduced() || event.button !== 0 || target.matches(':disabled,[aria-disabled="true"]')) return
  if (getComputedStyle(target).position === 'static') target.style.position = 'relative'
  const rect = target.getBoundingClientRect()
  target.style.setProperty('--touch-x', `${event.clientX - rect.left}px`)
  target.style.setProperty('--touch-y', `${event.clientY - rect.top}px`)
  target.classList.remove('motion-touch')
  void target.offsetWidth
  target.classList.add('motion-touch')
}

/** Moves a single paint-only indicator, preserving Radix focus/keyboard behavior. */
export function useSlidingIndicator(ref: RefObject<HTMLElement>, selector: string) {
  useEffect(() => {
    const root = ref.current
    if (!root) return
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const active = root.querySelector<HTMLElement>(selector)
        root.dataset.indicator = active ? 'ready' : 'hidden'
        if (!active) return
        root.style.setProperty('--indicator-x', `${active.offsetLeft}px`)
        root.style.setProperty('--indicator-width', `${active.offsetWidth}px`)
        root.style.setProperty('--indicator-y', `${active.offsetTop}px`)
        root.style.setProperty('--indicator-height', `${active.offsetHeight}px`)
      })
    }
    const resize = new ResizeObserver(update)
    resize.observe(root)
    const observer = new MutationObserver(update)
    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-state', 'aria-current', 'class'] })
    update()
    return () => { cancelAnimationFrame(frame); resize.disconnect(); observer.disconnect() }
  }, [ref, selector])
}

/** Individual table paint layers move after a committed layout change; sensors keep real coordinates. */
export function useTableLayoutMotion(ref: RefObject<HTMLElement>, signature: string, dragging: boolean) {
  const previous = useRef(new Map<string, { left: number; top: number; width: number; height: number }>())
  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    const origin = root.getBoundingClientRect()
    const next = new Map<string, { left: number; top: number; width: number; height: number }>()
    const cleanups: (() => void)[] = []
    let count = 0
    root.querySelectorAll<HTMLElement>('[data-table-id]').forEach(element => {
      const key = element.dataset.tableId!
      const rect = element.getBoundingClientRect()
      const position = { left:rect.left-origin.left, top:rect.top-origin.top, width:rect.width, height:rect.height }
      const old = previous.current.get(key)
      next.set(key,position)
      if (!old || dragging || reduced() || rect.bottom < 0 || rect.top > innerHeight || ++count > 24) return
      const x = old.left-position.left, y = old.top-position.top
      if (Math.abs(x)+Math.abs(y)+Math.abs(old.width-position.width)+Math.abs(old.height-position.height)<2) return
      const copy = element.cloneNode(true) as HTMLElement
      copy.removeAttribute('id'); copy.removeAttribute('data-table-id')
      copy.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'))
      copy.setAttribute('aria-hidden','true'); copy.setAttribute('inert','')
      copy.classList.add('motion-ghost')
      Object.assign(copy.style,{ position:'fixed',left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`,margin:'0',zIndex:'45',pointerEvents:'none',transformOrigin:'0 0' })
      document.body.append(copy)
      const opacity = element.style.opacity
      element.style.opacity='0'
      const animation = copy.animate([
        { transform:`translate(${x}px,${y}px) scale(${old.width/Math.max(rect.width,1)},${old.height/Math.max(rect.height,1)})` },
        { transform:'translate(0,0) scale(1,1)' },
      ],{ duration:motionTokens.layout,easing:motionTokens.ease })
      let done = false
      const cleanup = () => { if (done) return; done=true; animation.cancel(); copy.remove(); element.style.opacity=opacity }
      animation.onfinish=cleanup
      cleanups.push(cleanup)
    })
    previous.current=next
    const cancel = () => cleanups.forEach(cleanup => cleanup())
    // Stop visual layers before a fresh touch/drag starts, including Android touch sensors.
    root.addEventListener('pointerdown',cancel,true)
    const media=matchMedia('(prefers-reduced-motion: reduce)')
    media.addEventListener('change',cancel)
    return () => { root.removeEventListener('pointerdown',cancel,true); media.removeEventListener('change',cancel); cancel() }
  },[ref,signature,dragging])
}

export function recordSuccess(id: string) {
  window.dispatchEvent(new CustomEvent('motion-record-success', { detail: id }))
}
