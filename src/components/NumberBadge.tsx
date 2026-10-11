import { Badge } from '@/components/ui/badge'
export function NumberBadge({ n }: { n: number }) {
  if (!n) return null
  return (
    <Badge
      className="absolute top-0 right-0 translate-x-1/3 -translate-y-1/3 h-5 min-w-5 flex items-center justify-center rounded-full bg-orange-500 hover:bg-orange-500 px-1 text-[11px] font-extrabold text-white tabular-nums border-none shadow-sm z-10"
    >
      {n > 99 ? '99+' : n}
    </Badge>
  )
}
