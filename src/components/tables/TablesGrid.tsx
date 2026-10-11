import { Badge } from '@/components/ui/badge'
import { RestaurantTable,STATUS_COLOR,STATUS_LABEL,TableStatus,useTables } from '@/hooks/useTables'
import { mergeTables,readableError } from '@/lib/restaurantTransactions'
import { tableGroupLayout } from '@/lib/tableLayout'
import { cn } from '@/lib/utils'
import { Link2 } from 'lucide-react'
import { ReactNode,useEffect,useMemo,useRef,useState } from 'react'
import { toast } from 'sonner'

function canMerge(a: TableStatus, b: TableStatus) {
  const ok: TableStatus[] = ['empty', 'serving']
  if (!ok.includes(a) || !ok.includes(b)) return false
  return a === 'empty' || b === 'empty'
}

type Cluster =
  | { kind: 'single'; table: RestaurantTable }
  | { kind: 'group'; groupId: string; tables: RestaurantTable[] }

interface Props {
  onSelectTable: (t: RestaurantTable) => void
  enableMerge?: boolean
  header?: ReactNode
}

export function TablesGrid({ onSelectTable, enableMerge = true, header }: Props) {
  const { tables, areas, reload, loading } = useTables()
  const [localStatuses, setLocalStatuses] = useState<Record<string, TableStatus>>({})
  const pendingIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (pendingIds.current.size === 0) return
    setLocalStatuses(prev => {
      const next = { ...prev }
      for (const id of Object.keys(next)) {
        const dbTable = tables.find(t => t.id === id)
        if (dbTable && dbTable.status === next[id]) {
          delete next[id]
          pendingIds.current.delete(id)
        }
      }
      return next
    })
  }, [tables])

  useEffect(() => {
    window.addEventListener('tables-need-reload', reload)

    const handleLocalSync = (e: Event) => {
      const { groupIds, nextStatus } = (e as CustomEvent).detail || {}
      if (groupIds && nextStatus) {
        groupIds.forEach((id: string) => pendingIds.current.add(id))
        setLocalStatuses(prev => {
          const next = { ...prev }
          groupIds.forEach((id: string) => { next[id] = nextStatus })
          return next
        })
      }
      reload()
    }

    window.addEventListener('sync-group-status', handleLocalSync)
    return () => {
      window.removeEventListener('tables-need-reload', reload)
      window.removeEventListener('sync-group-status', handleLocalSync)
    }
  }, [reload])

  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const longPressRef = useRef<number | null>(null)

  const tableById = (id: string) => tables.find(t => t.id === id) ?? null

  const performMerge = async (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return
    const s = tableById(sourceId), t = tableById(targetId)
    if (!s || !t) return
    if (!canMerge(s.status, t.status)) {
      toast.error('Chỉ ghép được bàn Trống ↔ Trống hoặc Trống ↔ Đang phục vụ')
      return
    }
    if (s.merged_group_id && t.merged_group_id && s.merged_group_id === t.merged_group_id) {
      toast.info('Hai bàn đã cùng nhóm'); return
    }
    try { await mergeTables(sourceId, targetId) }
    catch (error: unknown) { toast.error(readableError(error)); return }

    toast.success(`Đã ghép ${s.name} với ${t.name}`)
    reload()
  }

  const onTouchStart = (t: RestaurantTable) => () => {
    if (!enableMerge) return
    if (t.status !== 'empty') {
      toast.error(`Bàn ${t.name} đang hoạt động, không được phép dịch chuyển hay gộp cụm!`)
      return
    }
    longPressRef.current = window.setTimeout(() => {
      setDragId(t.id)
      if (navigator.vibrate) navigator.vibrate(40)
    }, 350)
  }

  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragId) {
      if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null }
      return
    }
    e.preventDefault()
    const touch = e.touches[0]
    const el = document.elementFromPoint(touch.clientX, touch.clientY)
    const tableEl = el?.closest('[data-table-id]') as HTMLElement | null
    setOverId(tableEl?.dataset.tableId ?? null)
  }

  const onTouchEnd = () => {
    if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null }
    if (dragId && overId && dragId !== overId) performMerge(dragId, overId)
    setDragId(null); setOverId(null)
  }

  const clustersByArea = useMemo(() => {
    const map: Record<string, Cluster[]> = {}
    for (const a of areas) {
      const areaTables = tables.filter(t => t.area_id === a.id)
      const seen = new Set<string>()
      const clusters: Cluster[] = []
      for (const t of areaTables) {
        if (seen.has(t.id)) continue
        if (t.merged_group_id) {
          const grouped = areaTables.filter(x => x.merged_group_id === t.merged_group_id)
          grouped.forEach(g => seen.add(g.id))
          clusters.push({ kind: 'group', groupId: t.merged_group_id, tables: grouped })
        } else {
          seen.add(t.id)
          clusters.push({ kind: 'single', table: t })
        }
      }
      map[a.id] = clusters
    }
    return map
  }, [tables, areas])

  const renderCell = (t: RestaurantTable, opts: { rounded: string; inGroup: boolean }) => {
    const currentStatus = localStatuses[t.id] ?? t.status
    const isDragging = dragId === t.id
    const isOver = overId === t.id && dragId && dragId !== t.id
    const draggable = enableMerge && currentStatus === 'empty'
    const isColorRestricted = currentStatus !== 'empty'

    return (
      <div
        key={t.id}
        data-table-id={t.id}
        draggable={draggable}
        onDragStart={(e) => {
          if (isColorRestricted) {
            e.preventDefault()
            toast.error(`Bàn ${t.name} đang hoạt động, không được phép di chuyển hay gộp cụm!`)
            return
          }
          setDragId(t.id)
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', t.id)
        }}
        onDragEnd={() => { setDragId(null); setOverId(null) }}
        onDragOver={(e) => {
          if (!enableMerge || !dragId || dragId === t.id) return
          e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOverId(t.id)
        }}
        onDragLeave={() => { if (overId === t.id) setOverId(null) }}
        onDrop={(e) => {
          e.preventDefault()
          const src = e.dataTransfer.getData('text/plain') || dragId
          if (src) performMerge(src, t.id)
          setDragId(null); setOverId(null)
        }}
        onTouchStart={onTouchStart(t)}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={() => { if (!dragId) onSelectTable({ ...t, status: currentStatus, merged_group_id: t.merged_group_id }) }}
        className={cn(
          'relative flex flex-1 aspect-square min-w-0 flex-col items-center justify-center p-2 shadow-card transition-colors duration-300 select-none',
          STATUS_COLOR[currentStatus], opts.rounded,
          opts.inGroup && 'border-r border-background/40 last:border-r-0',
          isDragging && 'opacity-40 scale-95',
          isOver && 'z-10 scale-110 ring-4 ring-primary ring-offset-2',
          !isDragging && !isOver && 'hover:brightness-110',
          isColorRestricted ? 'cursor-not-allowed opacity-95' : 'cursor-grab active:cursor-grabbing'
        )}
      >
        <div className="text-base font-bold leading-tight md:text-xl">{t.name}</div>
        <div className="mt-0.5 text-[10px] opacity-90 md:text-xs">{t.seats} chỗ</div>
        <Badge variant="secondary" className="absolute bottom-1 text-[9px]">{STATUS_LABEL[currentStatus]}</Badge>
      </div>
    )
  }

  if (loading) return <div className="p-4 text-sm text-muted-foreground">Đang tải sơ đồ bàn...</div>

  return (
    <div className="space-y-6 p-4 md:p-6">
      {header}
      {areas.map(a => {
        const clusters = clustersByArea[a.id] ?? []
        return (
          <section key={a.id}>
            <h2 className="mb-2 text-sm font-bold text-muted-foreground">{a.name}</h2>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 md:gap-3">
              {clusters.map(c => {
                if (c.kind === 'single') {
                  return (
                    <div key={c.table.id} className="relative">
                      {renderCell(c.table, { rounded: 'rounded-2xl', inGroup: false })}
                    </div>
                  )
                }
                const layout = tableGroupLayout(c.tables.length)
                return (
                  <div
                    key={c.groupId}
                    className={cn('relative min-w-0 overflow-hidden rounded-2xl ring-2 ring-primary/70 ring-offset-2 bg-background shadow-md',layout.span)}
                  >
                    <div className={cn('grid w-full',layout.grid)}>
                      {c.tables.map(t => renderCell(t, { rounded: 'rounded-none', inGroup: true }))}
                    </div>
                    <div className="absolute right-1 top-1 z-10 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground shadow">
                      <Link2 className="h-3 w-3" /> {c.tables.length} bàn
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
