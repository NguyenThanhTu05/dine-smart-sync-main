import type { ReactNode } from 'react'
import type { RestaurantTable } from '@/hooks/useTables'
import { NumberBadge } from '@/components/NumberBadge'
import { tableGroupLayout } from '@/lib/tableLayout'
import { cn } from '@/lib/utils'
import { Link2 } from 'lucide-react'

export function MergedTableGroup({ groupId, tables, columns, ready, renderTable }: {
  groupId: string; tables: RestaurantTable[]; columns: 3 | 6; ready: number;
  renderTable: (table: RestaurantTable) => ReactNode
}) {
  const layout = tableGroupLayout(tables.length, columns)
  let offset = 0
  return <div data-motion-layout={`group-${groupId}`} data-table-group={groupId} style={{ gridRow: `span ${layout.rows.length}` }}
    className={cn('relative min-w-0 rounded-2xl bg-background shadow-md', layout.span)}>
    <div className="overflow-hidden rounded-2xl">
      {layout.rows.map((count, row) => {
        const members = tables.slice(offset, offset + count)
        offset += count
        return <div key={row} data-group-row={row} style={{ aspectRatio: layout.columns }}
          className={cn('flex w-full', row > 0 && 'border-t border-white/35')}>
          {members.map((table, index) => <div key={table.id}
            className={cn('flex min-w-0 flex-1', index > 0 && 'border-l border-white/35')}>
            {renderTable(table)}
          </div>)}
        </div>
      })}
    </div>
    <NumberBadge n={ready} label={`${ready} món chờ bê của nhóm ${tables.map(table => table.name).join(', ')}`} />
    <div data-motion-count className="pointer-events-none absolute left-1 top-1 z-10 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground shadow">
      <Link2 className="h-3 w-3" /> {tables.length} bàn
    </div>
  </div>
}
