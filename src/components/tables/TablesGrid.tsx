import { AnimatedHeading } from '@/components/TypographyMotion'
import { useTableLayoutMotion } from '@/lib/motion'
import { MergedTableGroup } from './MergedTableGroup'
import { TouchTableDnd,TouchTableSurface } from '@/components/tables/TouchTableDrag'
import { NumberBadge } from '@/components/NumberBadge'
import { Badge } from '@/components/ui/badge'
import { RestaurantTable,STATUS_COLOR,STATUS_LABEL,TableStatus,useTables } from '@/hooks/useTables'
import { useGlobalCounts } from '@/hooks/useGlobalCounts'
import { useIsMobile } from '@/hooks/use-mobile'
import { readyCountForTable } from '@/lib/notificationCounts'
import { mergeTables,readableError } from '@/lib/restaurantTransactions'
import { tableClustersByArea } from '@/lib/tableLayout'
import { cn } from '@/lib/utils'
import { ReactNode,useEffect,useMemo,useRef,useState } from 'react'
import { toast } from '@/lib/notifications'

function canMerge(a: TableStatus, b: TableStatus) {
  const ok: TableStatus[] = ['empty', 'serving']
  if (!ok.includes(a) || !ok.includes(b)) return false
  return a === 'empty' || b === 'empty'
}

interface Props {
  onSelectTable: (t: RestaurantTable) => void
  enableMerge?: boolean
  header?: ReactNode
}

export function TablesGrid({ onSelectTable, enableMerge = true, header }: Props) {
  const { tables, areas, reload, loading } = useTables()
  const { readyByTable, readyError } = useGlobalCounts()
  const isMobile = useIsMobile()
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

  const layoutRef = useRef<HTMLDivElement>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)


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

  const clustersByArea = useMemo(() => tableClustersByArea(tables, areas.map(area => area.id)), [tables, areas])

  const renderCell = (t: RestaurantTable, opts: { rounded: string; inGroup: boolean; areaLabel?: string }) => {
    const currentStatus = localStatuses[t.id] ?? t.status
    const isDragging = dragId === t.id
    const isOver = overId === t.id && dragId && dragId !== t.id
    const draggable = enableMerge && currentStatus === 'empty'
    const isColorRestricted = currentStatus !== 'empty'
    const ready = currentStatus === 'serving' ? readyCountForTable(t, tables, readyByTable) : 0

    return (
      <TouchTableSurface
        key={t.id}
        tableId={t.id}
        disabledDrag={!draggable}
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
        onClick={() => { if (!dragId) onSelectTable({ ...t, status: currentStatus, merged_group_id: t.merged_group_id }) }}
        className={cn(
          'app-table-surface relative flex flex-1 min-w-0 flex-col items-center justify-center p-2 transition-colors duration-300 select-none',
          STATUS_COLOR[currentStatus], opts.rounded,
          opts.inGroup ? 'aspect-auto shadow-none' : 'aspect-square shadow-card',
          isDragging && 'opacity-40 scale-95',
          isOver && 'z-10 scale-110 ring-4 ring-primary ring-offset-2',
          !isDragging && !isOver && 'hover:brightness-110',
          isColorRestricted ? 'cursor-not-allowed opacity-95' : 'cursor-grab active:cursor-grabbing'
        )}
      >
        {!opts.inGroup && <NumberBadge n={ready} label={`${ready} món chờ bê${t.merged_group_id ? ' của nhóm bàn' : ` tại ${t.name}`}`} />}
        <AnimatedHeading as="span" className="text-base font-bold leading-tight md:text-xl">{t.name}</AnimatedHeading>
        {opts.areaLabel && <div className="max-w-full truncate text-[10px] opacity-90" title={opts.areaLabel}>{opts.areaLabel}</div>}
        <div className="mt-0.5 text-[10px] opacity-90 md:text-xs">{t.seats} chỗ</div>
        <Badge variant="secondary" className="absolute bottom-1 text-[9px]">{STATUS_LABEL[currentStatus]}</Badge>
      </TouchTableSurface>
    )
  }

  useTableLayoutMotion(layoutRef, tables.map(t => `${t.id}:${t.merged_group_id}:${t.area_id}`).join('|') + String(isMobile), !!dragId)

  if (loading) return <div className="p-4 text-sm text-muted-foreground">Đang tải sơ đồ bàn...</div>

  const draggedTable = dragId ? tableById(dragId) : null
  return (
    <TouchTableDnd onStart={setDragId} onOver={setOverId} onCancel={() => { setDragId(null); setOverId(null) }}
      onEnd={(source,target) => { setDragId(null); setOverId(null); if (target?.kind === 'table') void performMerge(source,target.id) }}
      overlay={draggedTable && <div className={cn('relative flex aspect-square flex-col items-center justify-center rounded-2xl p-2 shadow-lg',STATUS_COLOR[localStatuses[draggedTable.id] ?? draggedTable.status])}><div className="text-base font-bold md:text-xl">{draggedTable.name}</div><div className="text-[10px] md:text-xs">{draggedTable.seats} chỗ</div><Badge variant="secondary" className="absolute bottom-1 text-[9px]">{STATUS_LABEL[localStatuses[draggedTable.id] ?? draggedTable.status]}</Badge></div>}>
    <div ref={layoutRef} className="space-y-6 p-4 md:p-6">
      {header}
      {readyError && <p role="status" className="text-xs text-muted-foreground">Chưa cập nhật được số món chờ bê. Kiểm tra mạng; hệ thống sẽ tải lại khi kết nối hoặc quay lại trang.</p>}
      {areas.map(a => {
        const clusters = clustersByArea[a.id] ?? []
        return (
          <section key={a.id}>
            <h2 className="mb-2 text-sm font-bold text-muted-foreground">{a.name}</h2>
            {areas.filter(host => host.id !== a.id).flatMap(host => (clustersByArea[host.id] ?? [])
              .filter(cluster => cluster.kind === 'group' && cluster.tables.some(table => table.area_id === a.id))
              .map(cluster => cluster.kind === 'group' && <p key={cluster.groupId} className="mb-2 text-xs text-muted-foreground">
                {cluster.tables.filter(table => table.area_id === a.id).map(table => table.name).join(' + ')} đang ghép tại {host.name}.
              </p>))}
            <div className={cn('grid grid-flow-row-dense items-start gap-2 md:gap-3', isMobile ? 'grid-cols-3' : 'grid-cols-6')}>
              {clusters.map(c => {
                if (c.kind === 'single') {
                  return (
                    <div key={c.table.id} data-motion-layout={c.table.id} className="relative">
                      {renderCell(c.table, { rounded: 'rounded-2xl', inGroup: false })}
                    </div>
                  )
                }
                const ready = c.tables.some(table => (localStatuses[table.id] ?? table.status) === 'serving')
                  ? readyCountForTable(c.tables[0], tables, readyByTable) : 0
                const crossArea = new Set(c.tables.map(table => table.area_id)).size > 1
                return <MergedTableGroup key={c.groupId} groupId={c.groupId} tables={c.tables}
                  columns={isMobile ? 3 : 6} ready={ready}
                  renderTable={table => renderCell(table, { rounded: 'rounded-none', inGroup: true,
                    areaLabel: crossArea ? areas.find(area => area.id === table.area_id)?.name ?? 'Chưa có khu vực' : undefined })} />

              })}
            </div>
          </section>
        )
      })}
    </div>
    </TouchTableDnd>
  )
}
