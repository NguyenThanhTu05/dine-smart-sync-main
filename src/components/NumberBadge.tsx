import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
export function NumberBadge({ n, label, className }: { n: number; label?: string; className?: string }) {
  if (!Number.isFinite(n) || n <= 0) return null
  return (
    <Badge
      title={label ?? `${n} thông báo`}
      aria-label={label ?? `${n} thông báo`}
      className={cn('app-count-badge h-5 min-w-5 flex shrink-0 items-center justify-center rounded-full bg-orange-500 hover:bg-orange-500 px-1 text-[11px] font-extrabold text-white tabular-nums border-none shadow-sm z-20 absolute top-0 right-0 translate-x-1/3 -translate-y-1/3', className)}
    >
      {n > 99 ? '99+' : n}
    </Badge>
  )
}
