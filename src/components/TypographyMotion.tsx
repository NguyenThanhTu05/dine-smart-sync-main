import { type ComponentPropsWithoutRef, type CSSProperties, type ReactNode, useLayoutEffect, useRef } from 'react'
import { reduced } from '@/lib/motion'
import { cn } from '@/lib/utils'

type HeadingTag = 'h1' | 'h2' | 'h3' | 'span'
type HeadingProps = ComponentPropsWithoutRef<'h2'> & { as?: HeadingTag; accent?: boolean }

export function AnimatedHeading({ as: Tag = 'h2', accent = false, children, className, ...props }: HeadingProps) {
  const words = typeof children === 'string' ? children.trim().split(/\s+/) : null
  return <Tag {...props} className={cn('type-heading', accent && 'type-heading-accent', className)}>
    {words && words.length <= 12 ? <><span className="sr-only">{children}</span><span aria-hidden="true">{words.map((word, index) => <span key={`${index}-${word}`} className="type-word-mask"><span className="type-word" style={{ '--word-delay': `${Math.min(index, 7) * 35}ms` } as CSSProperties}>{word}</span>{index < words.length - 1 ? '\u00a0' : ''}</span>)}</span></> : children}
  </Tag>
}

// Status transitions are visual only: the current business value is rendered immediately.
export function AnimatedStatus({ children }: { children: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const previous = useRef(children)
  useLayoutEffect(() => {
    const node = ref.current
    const old = previous.current
    previous.current = children
    if (!node || old === children || reduced() || node.closest('[data-static-tabs]')) return
    const copy = document.createElement('span')
    copy.textContent = old
    copy.setAttribute('aria-hidden', 'true')
    copy.className = 'type-status-old'
    node.parentElement?.append(copy)
    const exit = copy.animate([{ opacity: .5, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-4px)' }], { duration: 160, easing: 'ease-out' })
    const enter = node.animate([{ opacity: .6, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 200, easing: 'cubic-bezier(.22,1,.36,1)' })
    exit.onfinish = () => copy.remove()
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const stop = () => { if (media.matches) { exit.cancel(); enter.cancel(); copy.remove() } }
    media.addEventListener('change', stop)
    return () => { media.removeEventListener('change', stop); exit.cancel(); enter.cancel(); copy.remove() }
  }, [children])
  return <span className="type-status"><span ref={ref}>{children}</span></span>
}

export function TextReveal({ children }: { children: ReactNode }) {
  return <span className="type-reveal">{children}</span>
}
