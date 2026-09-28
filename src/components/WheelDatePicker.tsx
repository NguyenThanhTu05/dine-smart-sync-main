import { useEffect, useRef, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { CalendarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const ITEM_H = 36
const VISIBLE = 5 // odd, must match padding (VISIBLE-1)/2

function Wheel({ items, value, onChange, formatter }: {
  items: number[]
  value: number
  onChange: (v: number) => void
  formatter?: (v: number) => string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const tRef = useRef<number | null>(null)
  const idx = Math.max(0, items.indexOf(value))

  useEffect(() => {
    if (!ref.current) return
    ref.current.scrollTop = idx * ITEM_H
  }, [idx])

  const onScroll = () => {
    if (!ref.current) return
    if (tRef.current) window.clearTimeout(tRef.current)
    tRef.current = window.setTimeout(() => {
      const el = ref.current!
      const i = Math.round(el.scrollTop / ITEM_H)
      const clamped = Math.max(0, Math.min(items.length - 1, i))
      el.scrollTo({ top: clamped * ITEM_H, behavior: 'smooth' })
      const v = items[clamped]
      if (v !== value) onChange(v)
    }, 80)
  }

  const pad = (VISIBLE - 1) / 2
  return (
    <div className="relative h-[180px] flex-1 overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-9 -translate-y-1/2 rounded-md border-y border-primary/40 bg-primary/5" />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[72px] bg-gradient-to-b from-background to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[72px] bg-gradient-to-t from-background to-transparent" />
      <div
        ref={ref}
        onScroll={onScroll}
        className="h-full snap-y snap-mandatory overflow-y-scroll scrollbar-none"
        style={{ scrollbarWidth: 'none' }}
      >
        <div style={{ height: pad * ITEM_H }} />
        {items.map((it) => (
          <div
            key={it}
            className={cn(
              'snap-center text-center tabular-nums transition-all',
              it === value ? 'text-base font-semibold text-foreground' : 'text-sm text-muted-foreground/70'
            )}
            style={{ height: ITEM_H, lineHeight: `${ITEM_H}px` }}
          >
            {formatter ? formatter(it) : it}
          </div>
        ))}
        <div style={{ height: pad * ITEM_H }} />
      </div>
    </div>
  )
}

function parse(value?: string) {
  const today = new Date()
  if (!value) return { d: today.getDate(), m: today.getMonth() + 1, y: today.getFullYear() - 20 }
  const [y, m, d] = value.split('-').map(Number)
  return { d: d || 1, m: m || 1, y: y || today.getFullYear() }
}

function fmt(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function daysIn(y: number, m: number) {
  return new Date(y, m, 0).getDate()
}

export function WheelDatePicker({ value, onChange, placeholder = 'Chọn ngày', className }: {
  value?: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const init = parse(value)
  const [d, setD] = useState(init.d)
  const [m, setM] = useState(init.m)
  const [y, setY] = useState(init.y)

  useEffect(() => {
    const p = parse(value)
    setD(p.d); setM(p.m); setY(p.y)
  }, [value])

  const now = new Date().getFullYear()
  const years = Array.from({ length: 100 }, (_, i) => now - i).reverse()
  const months = Array.from({ length: 12 }, (_, i) => i + 1)
  const maxD = daysIn(y, m)
  const days = Array.from({ length: maxD }, (_, i) => i + 1)
  const safeD = Math.min(d, maxD)

  const confirm = () => {
    onChange(fmt(y, m, safeD))
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn('w-full justify-start font-normal', !value && 'text-muted-foreground', className)}>
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? `${String(safeD).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}` : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-3" align="start">
        <div className="mb-2 flex justify-around text-xs font-medium text-muted-foreground">
          <span>Ngày</span><span>Tháng</span><span>Năm</span>
        </div>
        <div className="flex gap-2">
          <Wheel items={days} value={safeD} onChange={setD} />
          <Wheel items={months} value={m} onChange={setM} formatter={(v) => `Th ${v}`} />
          <Wheel items={years} value={y} onChange={setY} />
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Huỷ</Button>
          <Button size="sm" onClick={confirm}>Chọn</Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
