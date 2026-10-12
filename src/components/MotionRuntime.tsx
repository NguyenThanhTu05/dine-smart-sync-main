import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'
import { motionTokens as t, reduced, touchFeedback } from '@/lib/motion'

type Snapshot = { node: HTMLElement; rect: DOMRect; copy: HTMLElement; text?: string }
const selectors = '[data-motion-id],.app-card,button.bg-card,[data-table-id],[data-motion-message]'
const scrollPositions = new Map<string, number>()
let origin: { element: HTMLElement; rect: DOMRect; time: number } | null = null

function animate(element: HTMLElement, frames: Keyframe[], duration: number = t.layout, delay = 0) {
  if (reduced()) return
  return element.animate(frames, { duration, delay, easing: t.ease })
}
function inertCopy(element: HTMLElement) {
  const copy = element.cloneNode(true) as HTMLElement
  copy.setAttribute('aria-hidden', 'true')
  copy.setAttribute('inert', '')
  copy.removeAttribute('id')
  copy.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'))
  copy.querySelectorAll('iframe,video,audio,.motion-ghost').forEach(node => node.remove())
  copy.querySelectorAll('input,textarea,select,button').forEach(node => node.setAttribute('tabindex', '-1'))
  return copy
}
function ghost(snapshot: Snapshot, complete = false) {
  if (reduced() || snapshot.rect.bottom < 0 || snapshot.rect.top > innerHeight) return
  const copy = snapshot.copy
  copy.classList.add('motion-ghost')
  Object.assign(copy.style, { position: 'fixed', left: `${snapshot.rect.left}px`, top: `${snapshot.rect.top}px`, width: `${snapshot.rect.width}px`, height: `${snapshot.rect.height}px`, margin: '0', pointerEvents: 'none', zIndex: '90', overflow: 'hidden' })
  document.body.append(copy)
  if (complete) addCheck(copy)
  const animation = animate(copy, [{ opacity: .9, scale: 1, translate: '0 0' }, { opacity: 0, scale: .96, translate: '14px -6px' }], complete ? t.success : 220)
  if (animation) animation.onfinish = () => copy.remove()
  else copy.remove()
  window.setTimeout(() => copy.remove(), 650)
}
function addCheck(target: HTMLElement) {
  const mark = document.createElement('span')
  mark.className = 'motion-record-check'
  mark.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m7 12 3 3 7-7"/></svg>'
  target.append(mark)
  window.setTimeout(() => mark.remove(), t.success + 100)
}

/** Paint-only orchestration. It never calls business handlers, navigates or writes data. */
export function MotionRuntime() {
  const location = useLocation()
  const navigation = useNavigationType()
  const keyRef = useRef(location.key)
  const pathnameRef = useRef<string | null>(null)
  const routeQuietUntil = useRef(0)
  useLayoutEffect(() => {
    keyRef.current = location.key
    if (pathnameRef.current === location.pathname) return
    pathnameRef.current = location.pathname
    routeQuietUntil.current = performance.now() + 700
    let animation: Animation | undefined
    let started = false
    const reveal = () => {
      const main = document.querySelector<HTMLElement>('main')
      if (!main || main.querySelector('[data-page-loading]')) return
      if (started) return
      started = true
      observer?.disconnect()
      const saved = navigation === 'POP' ? scrollPositions.get(location.key) : undefined
      main.scrollTop = saved ?? 0
      routeQuietUntil.current = performance.now() + 400
      if (!reduced()) animation = main.animate([
        { opacity: .7, transform: `translate3d(${navigation === 'POP' ? -10 : 10}px,0,0)` },
        { opacity: 1, transform: 'translate3d(0,0,0)' },
      ], { duration: 260, easing: 'cubic-bezier(.22,1,.36,1)' })
    }
    const observer = new MutationObserver(reveal)
    observer.observe(document.body, { childList: true, subtree: true })
    reveal()
    return () => { observer?.disconnect(); animation?.cancel() }
  }, [location.pathname, location.key, navigation])

  useEffect(() => {
    const active = new Set<Animation>()
    const ghosts = new Set<HTMLElement>()
    const seen = new WeakSet<HTMLElement>()
    const seenIds = new Set<string>()
    const previous = new Map<string, Snapshot>()
    const positions = new WeakMap<HTMLElement, { x: number; y: number }>()
    const dialogs = new WeakSet<HTMLElement>()
    const dialogOrigins = new WeakMap<HTMLElement, DOMRect>()
    const readyCounts = new Map<string, number>()
    const counters = new WeakMap<HTMLElement, string>()
    let frame = 0, lastScroll = 0, lastHeaderY = 0, autoId = 0
    let dragging = false
    const ids = new WeakMap<HTMLElement, string>()
    const play = (el: HTMLElement, frames: Keyframe[], duration: number = t.layout, delay = 0) => {
      const animation = animate(el, frames, duration, delay)
      if (animation) { active.add(animation); animation.onfinish = () => active.delete(animation) }
    }
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null
      if (!target) return
      const card = target.closest<HTMLElement>('[data-table-id],[data-motion-origin],[data-motion-id],.dashboard-kpi,.app-card')
      // Only a deliberate detail opener becomes a morph origin, never a delete/submit button.
      if (card && !target.closest('button[type=submit],[data-no-morph]')) origin = { element: card, rect: card.getBoundingClientRect(), time: Date.now() }
    }
    const onPointer = (event: PointerEvent) => {
      const el = event.target instanceof Element ? event.target.closest<HTMLElement>('button,a,[data-motion-id],[data-table-id]') : null
      if (!el || el.closest('.motion-ghost') || el.matches(':disabled,[aria-disabled=true]')) return
      if (el.closest('[data-table-id],.area-table-card')) {
        // Cancel layout transforms before drag sensors measure the real rectangle.
        active.forEach(animation => { if (animation.effect instanceof KeyframeEffect && animation.effect.target instanceof Element && (animation.effect.target === el || el.contains(animation.effect.target) || animation.effect.target.contains(el))) animation.cancel() })
        return
      }
      if (el.matches('button:not(.app-action)')) touchFeedback({ currentTarget: el, button: event.button, clientX: event.clientX, clientY: event.clientY } as React.PointerEvent<HTMLElement>)
    }
    const dragStart = () => { dragging = true; active.forEach(animation => animation.cancel()) }
    const dragEnd = () => { dragging = false }
    const onScroll = (event: Event) => {
      const main = document.querySelector<HTMLElement>('main')
      if (event.target !== main || !main) return
      lastScroll = performance.now()
      scrollPositions.set(keyRef.current, main.scrollTop)
      if (scrollPositions.size > 40) scrollPositions.delete(scrollPositions.keys().next().value!)
      const header = document.querySelector<HTMLElement>('.mobile-header')
      if (header && !document.documentElement.classList.contains('keyboard-open')) {
        header.dataset.compact = main.scrollTop > 64 && main.scrollTop - lastHeaderY > 0 ? 'true' : 'false'
        lastHeaderY = main.scrollTop
      }
    }
    const morph = (dialog: HTMLElement) => {
      if (reduced() || dialog.closest('.motion-ghost') || dialog.classList.contains('mobile-menu') || dialog.hasAttribute('data-vaul-drawer') || /slide-in-from-(left|right)/.test(dialog.className)) return
      const closed = dialog.dataset.state === 'closed'
      const start = closed ? dialogOrigins.get(dialog) : origin && Date.now() - origin.time < 1100 && origin.element.isConnected ? origin.rect : null
      if (!start) return
      if (!closed) dialogOrigins.set(dialog, start)
      const rect = dialog.getBoundingClientRect()
      const dx = start.left + start.width / 2 - rect.left - rect.width / 2
      const dy = start.top + start.height / 2 - rect.top - rect.height / 2
      const scale = Math.max(.72, Math.min(.94, start.width / Math.max(rect.width, 1)))
      const from: Keyframe = { opacity: 0, translate: `${dx * .35}px ${dy * .35}px`, scale, borderRadius: '24px' }
      const to: Keyframe = { opacity: 1, translate: '0 0', scale: 1, borderRadius: getComputedStyle(dialog).borderRadius }
      // A paint-only shell interpolates the full card bounds without stretching text or remounting the dialog.
      const shell = document.createElement('div')
      shell.className = 'motion-ghost motion-morph-shell'
      shell.setAttribute('aria-hidden', 'true'); shell.setAttribute('inert', '')
      Object.assign(shell.style, { position:'fixed', left:`${rect.left}px`, top:`${rect.top}px`, width:`${rect.width}px`, height:`${rect.height}px`, borderRadius:'24px', background:'hsl(var(--card))', border:'1px solid hsl(var(--primary) / .2)', zIndex:'50', transformOrigin:'0 0', pointerEvents:'none' })
      document.body.append(shell); ghosts.add(shell)
      const compact: Keyframe = { transform:`translate(${start.left-rect.left}px,${start.top-rect.top}px) scale(${start.width/Math.max(rect.width,1)},${start.height/Math.max(rect.height,1)})`, opacity:.9 }
      const expanded: Keyframe = { transform:'translate(0,0) scale(1,1)', opacity:0 }
      const shellAnimation = animate(shell, closed ? [expanded, { ...compact, opacity:0 }] : [compact,expanded], closed ? 170 : t.dialog)
      if (shellAnimation) shellAnimation.onfinish = () => { shell.remove(); ghosts.delete(shell) }
      window.setTimeout(() => { shell.remove(); ghosts.delete(shell) }, 350)
      dialog.classList.add('premium-morph-dialog')
      play(dialog, closed ? [to, from] : [from, to], closed ? 170 : t.dialog)
    }
    let scannedPath = window.location.pathname
    const scan = () => {
      if (scannedPath !== window.location.pathname) {
        previous.clear()
        scannedPath = window.location.pathname
        active.forEach(animation => animation.cancel())
        active.clear()
      }
      const routeSettling = performance.now() < routeQuietUntil.current
      if (reduced()) return
      const current = new Map<string, Snapshot>()
      let entered = 0
      const entering = new Set<HTMLElement>()
      document.querySelectorAll<HTMLElement>(selectors).forEach(el => {
        if (el.closest('.motion-ghost') || el.closest('aside,nav') || (el.offsetWidth === 0 && el.offsetHeight === 0)) return
        const id = el.dataset.motionId || el.dataset.motionMessage || ids.get(el) || `node-${++autoId}`
        ids.set(el, id)
        const parent = el.parentElement?.closest<HTMLElement>(selectors)
        const rect = el.getBoundingClientRect()
        const visible = rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth
        const isTable = !!el.closest('[data-table-id],[data-table-group],.area-table-card')
        let x = 0, y = 0, offset: HTMLElement | null = el
        while (offset) { x += offset.offsetLeft; y += offset.offsetTop; offset = offset.offsetParent as HTMLElement | null }
        const old = positions.get(el)
        positions.set(el, { x, y })
        if (!seen.has(el) && !seenIds.has(id)) {
          seen.add(el); seenIds.add(id)
          if (!routeSettling && visible && !isTable && (!parent || !entering.has(parent)) && entered < 16) {
            entering.add(el)
            play(el, [{ opacity: 0, translate: '0 14px', scale: .985 }, { opacity: 1, translate: '0 0', scale: 1 }], 300, Math.min(entered++ * t.stagger, 168))
          }
        } else if (!routeSettling && visible && !isTable && previous.get(id)?.node !== el && previous.has(id) && performance.now()-lastScroll>120) {
          const prior = previous.get(id)!
          play(el,[{ translate:`${prior.rect.left-rect.left}px ${prior.rect.top-rect.top}px`, opacity:.7 },{ translate:'0 0',opacity:1 }])
        } else if (!routeSettling && old && visible && !parent && !isTable && !dragging && performance.now() - lastScroll > 120 && Math.abs(old.x-x)+Math.abs(old.y-y)>2) {
          play(el, [{ translate: `${old.x-x}px ${old.y-y}px` }, { translate: '0 0' }])
        }
        // Only cache visible, explicitly keyed records; cap snapshot work and never cache a dragged table.
        if (visible && el.dataset.motionId && !isTable && current.size < 32) {
          const prior = previous.get(id)
          current.set(id, { node: el, rect, text: el.textContent ?? '', copy: prior?.node === el && prior.text === el.textContent ? prior.copy : inertCopy(el) })
        }
      })
      let exits = 0
      previous.forEach((snapshot, id) => {
        if ([...previous.values()].some(other => other !== snapshot && !other.node.isConnected && other.node.contains(snapshot.node))) return
        if (!routeSettling && !snapshot.node.isConnected && !document.querySelector(`[data-motion-id="${CSS.escape(id)}"]`) && exits++ < 4) ghost(snapshot)
      })
      if (seenIds.size > 2000) { let count = 0; for (const id of seenIds) { seenIds.delete(id); if (++count >= 500) break } }
      previous.clear(); current.forEach((value,key) => previous.set(key,value))
      document.querySelectorAll<HTMLElement>('[role=dialog][data-state],[role=alertdialog][data-state]').forEach(dialog => {
        if (!dialogs.has(dialog)) { dialogs.add(dialog); morph(dialog) }
      })
      const presentReady = new Set<string>()
      document.querySelectorAll<HTMLElement>('.app-count-badge,[data-motion-count]').forEach(el => {
        const value = el.textContent ?? ''
        const old = counters.get(el)
        counters.set(el, value)
        const table = el.closest<HTMLElement>('[data-table-id],[data-table-group]')
        const tableKey = table?.dataset.tableId || table?.dataset.tableGroup
        if (table && tableKey) {
          presentReady.add(tableKey)
          const number = Number.parseInt(value,10)
          const prior = readyCounts.get(tableKey)
          if (prior !== undefined && number > prior) {
            table.dataset.motionNotice = 'true'
            window.setTimeout(() => { if (table.isConnected) delete table.dataset.motionNotice }, 650)
          }
          if (Number.isFinite(number)) readyCounts.set(tableKey,number)
        }
        if (old !== undefined && old !== value) play(el, [{ scale: .85, opacity: .5 }, { scale: 1.12, opacity: 1 }, { scale: 1, opacity: 1 }], 240)
      })
      for (const key of readyCounts.keys()) if (!presentReady.has(key)) readyCounts.set(key,0)
      document.querySelectorAll<HTMLElement>('[data-motion-tabs],nav:has(a[aria-current=page])').forEach(root => {
        if (root.closest('.motion-ghost') || root.classList.contains('motion-indicator')) return
        const activeItem = root.querySelector<HTMLElement>('[aria-pressed=true],a[aria-current=page]')
        if (!activeItem) return
        if (root.tagName === 'NAV') {
          root.classList.add('web-sidebar-motion')
          root.classList.remove('premium-auto-tabs')
          return
        }
        root.classList.add('premium-auto-tabs')
        root.style.setProperty('--active-x', `${activeItem.offsetLeft}px`)
        root.style.setProperty('--active-y', `${activeItem.offsetTop}px`)
        root.style.setProperty('--active-w', `${activeItem.offsetWidth}px`)
        root.style.setProperty('--active-h', `${activeItem.offsetHeight}px`)
      })
    }
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'attributes' && record.attributeName === 'data-state' && record.target instanceof HTMLElement && record.target.matches('[role=dialog],[role=alertdialog]')) morph(record.target)
      }
      if (!records.some(record => (record.target instanceof Element && record.target.closest('[data-motion-count],.app-count-badge')) || record.type === 'attributes' || [...record.addedNodes,...record.removedNodes].some(node => node instanceof HTMLElement && !node.closest('.motion-ghost')))) return
      cancelAnimationFrame(frame); frame = requestAnimationFrame(scan)
    })
    observer.observe(document.body, { subtree:true, childList:true, attributes:true, attributeFilter:['data-state','aria-current','aria-pressed','data-motion-count'] })
    const resize = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(scan) }
    const success = (event: Event) => {
      const id = (event as CustomEvent<string>).detail
      const element = document.querySelector<HTMLElement>(`[data-motion-id="${CSS.escape(id)}"]`)
      if (element && !reduced()) {
        const copy = inertCopy(element)
        ghost({ node:element, rect:element.getBoundingClientRect(), copy }, true)
        for (const [key,snapshot] of previous) if (snapshot.node === element || snapshot.node.contains(element)) previous.delete(key)
      }
    }
    document.addEventListener('click', onClick, true)
    document.addEventListener('pointerdown', onPointer, true)
    document.addEventListener('dragstart', dragStart, true)
    document.addEventListener('dragend', dragEnd, true)
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', resize)
    window.addEventListener('motion-record-success', success)
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const preference = () => { if (media.matches) { active.forEach(animation => animation.cancel()); document.querySelectorAll('.motion-ghost').forEach(el => el.remove()) } else resize() }
    media.addEventListener('change', preference)
    scan()
    return () => { observer.disconnect(); cancelAnimationFrame(frame); active.forEach(animation => animation.cancel()); ghosts.forEach(el => el.remove()); document.removeEventListener('click',onClick,true); document.removeEventListener('pointerdown',onPointer,true); document.removeEventListener('dragstart',dragStart,true); document.removeEventListener('dragend',dragEnd,true); document.removeEventListener('scroll',onScroll,true); window.removeEventListener('resize',resize); window.removeEventListener('motion-record-success',success); media.removeEventListener('change',preference) }
  }, [])
  return null
}
