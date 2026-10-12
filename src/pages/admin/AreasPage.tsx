import { AnimatedHeading } from '@/components/TypographyMotion'
import { TouchAreaSurface,TouchTableDnd,TouchTableSurface } from '@/components/tables/TouchTableDrag'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/contexts/authState'
import { RestaurantTable,useTables } from '@/hooks/useTables'
import { supabase } from '@/integrations/supabase/client'
import { decimalInput,requiredText } from '@/lib/inputValidation'
import { deleteEmptyArea, deleteEmptyTable } from '@/lib/tableDeletion'
import { getSharedBroadcastChannel } from '@/lib/tableGroup'
import { cn } from '@/lib/utils'
import { Link2,Plus,Trash2 } from 'lucide-react'
import { useRef,useState } from 'react'
import { toast } from '@/lib/notifications'

const STATUS_BG: Record<string, string> = {
  empty: 'bg-gray-100 text-gray-800 border-gray-300 hover:bg-gray-200/80',
  serving: 'bg-green-500 text-white border-green-600',
  awaiting_payment: 'bg-red-500 text-white border-red-600',
  needs_cleanup: 'bg-orange-500 text-white border-orange-600',
}

export default function AreasPage() {
  const { role } = useAuth()
  const canManageAreas = role === 'admin'
  const canMoveTables = role === 'admin' || role === 'cashier'
  const { areas: hookAreas, tables: hookTables, reload } = useTables()
  const [newArea, setNewArea] = useState('')
  const [newTable, setNewTable] = useState<Record<string, { name: string; seats: number | string }>>({})
  const [draggedTableId, setDraggedTableId] = useState<string | null>(null)
  const moveLock = useRef(false)
  const [moveBusy,setMoveBusy] = useState(false)

  const safeAreas = hookAreas || []
  const safeTables = hookTables || []
  const sortedTables = [...safeTables].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))

  // Dùng shared channel đã subscribe sẵn — không tạo channel mới mỗi lần gọi
  const broadcastLayoutChange = async () => {
    await getSharedBroadcastChannel().send({
      type: 'broadcast',
      event: 'table-layout-changed',
      payload: {},
    })
  }

  const addArea = async () => {
    if (!canManageAreas) return
    let name: string
    try { name = requiredText(newArea, 'Tên khu vực') } catch (error) { return toast.error((error as Error).message) }
    const { error } = await supabase.from('areas').insert({ name, sort_order: safeAreas.length + 1 })
    if (error) return toast.error(error.message)
    setNewArea('')
    reload()
    await broadcastLayoutChange()
  }

  const delArea = async (id: string) => {
    if (!canManageAreas) return
    if (!confirm('Xóa khu vực này?')) return
    try { await deleteEmptyArea(id) } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Không thể xóa khu vực.')
      await reload()
      return
    }
    reload()
    await broadcastLayoutChange()
  }

  const addTable = async (areaId: string) => {
    const v = newTable[areaId]
    let name: string, seats: number
    try { name = requiredText(v?.name, 'Tên bàn'); seats = decimalInput(v?.seats, 'Số ghế', 0, 1000, true) } catch (error) { return toast.error((error as Error).message) }
    const currentAreaTables = sortedTables.filter(t => t.area_id === areaId)
    const { error } = await supabase.from('restaurant_tables').insert({
      area_id: areaId,
      name,
      seats,
      sort_order: currentAreaTables.length + 1,
    })
    if (error) return toast.error(error.message)
    setNewTable(s => ({ ...s, [areaId]: { name: '', seats: 4 } }))
    reload()
    await broadcastLayoutChange()
  }

  const delTable = async (id: string) => {
    if (!confirm('Xóa bàn này?')) return
    try {
      await deleteEmptyTable(id)
      await reload()
      await broadcastLayoutChange()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Không thể xóa bàn.')
      await reload()
    }
  }

  const handleDragStart = (e: React.DragEvent, table: RestaurantTable) => {
    if (!canMoveTables || table.status !== 'empty') {
      e.preventDefault()
      toast.error(`Bàn ${table.name} đang hoạt động, không được phép thay đổi vị trí thứ tự!`)
      return
    }
    if (table.merged_group_id) {
      e.preventDefault()
      toast.error(`Bàn ${table.name} đang được ghép nhóm. Vui lòng tách bàn bên sơ đồ phục vụ trước khi đổi vị trí phân khu!`)
      return
    }
    setDraggedTableId(table.id)
    e.dataTransfer.setData('text/plain', table.id)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const performMove = async (sourceId: string,target: { area?: string; table?: string }) => {
    if (!canMoveTables || moveLock.current) return
    const source = sortedTables.find(table => table.id === sourceId)
    if (!source || source.status !== 'empty' || source.merged_group_id) return toast.error('Chỉ đổi vị trí bàn trống chưa ghép nhóm.')
    if (target.table === sourceId || target.area === source.area_id) return
    const destination = target.table ? sortedTables.find(table => table.id === target.table) : null
    if (target.table && (!destination || destination.status !== 'empty' || destination.merged_group_id)) return toast.error('Bàn đích đang hoạt động hoặc ghép nhóm, không thể đổi vị trí.')
    moveLock.current = true; setMoveBusy(true)
    try {
      const { error } = await supabase.rpc('restaurant_move_table',{ p_source: sourceId,...(target.area ? { p_area: target.area } : { p_target: target.table! }) })
      if (error) throw error
      await reload(); await broadcastLayoutChange(); toast.success('Đã cập nhật vị trí bàn')
    } catch (error) { toast.error((error as { message?: string }).message ?? 'Không thể chuyển bàn'); await reload() }
    finally { moveLock.current = false; setMoveBusy(false) }
  }
  const handleDropOnArea = (event: React.DragEvent,targetAreaId: string) => {
    event.preventDefault()
    const sourceId = event.dataTransfer.getData('text/plain') || draggedTableId
    setDraggedTableId(null)
    if (sourceId) void performMove(sourceId,{ area: targetAreaId })
  }
  const handleDropOnTable = (event: React.DragEvent,targetTable: RestaurantTable) => {
    event.stopPropagation(); event.preventDefault()
    const sourceId = event.dataTransfer.getData('text/plain') || draggedTableId
    setDraggedTableId(null)
    if (sourceId) void performMove(sourceId,{ table: targetTable.id })
  }
  const draggedTable = sortedTables.find(table => table.id === draggedTableId)

  return (
    <TouchTableDnd onStart={setDraggedTableId} onCancel={() => setDraggedTableId(null)}
      onEnd={(source,target) => { setDraggedTableId(null); if (target?.kind === 'table') void performMove(source,{ table: target.id }); else if (target?.kind === 'area') void performMove(source,{ area: target.id }) }}
      overlay={draggedTable && <div className={cn('rounded-xl border-2 p-3 text-sm font-semibold shadow-xl',STATUS_BG[draggedTable.status])}><b>{draggedTable.name}</b><div className="text-[10px]">{draggedTable.seats} chỗ • STT:{draggedTable.sort_order || 0}</div></div>}>
    <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
      <div>
        <AnimatedHeading as="h1" className="text-2xl font-bold md:text-3xl">Khu vực &amp; Bàn</AnimatedHeading>
        <p className="text-xs text-muted-foreground mt-1">
          💡 Hướng dẫn: Nhấn giữ rồi kéo cả thẻ bàn trống độc lập để thay đổi vị trí thứ tự hoặc phân khu. <span className="text-destructive font-semibold">Các bàn đang ăn nhậu hoặc đang được ghép nhóm sẽ bị khóa cứng vị trí kéo thả.</span>
        </p>
      </div>

      <Card className="flex gap-2 p-4 shadow-sm border">
        <Input
          value={newArea}
          onChange={(e) => setNewArea(e.target.value)}
          placeholder="Tên khu vực mới (vd: Tầng lửng, VIP...)"
          className="max-w-md"
        />
        <Button disabled={!canManageAreas} onClick={addArea}><Plus className="mr-1 h-4 w-4" />Thêm khu vực</Button>
      </Card>

      {safeAreas.map((a: { id: string; name: string }) => {
        const areaTables = sortedTables.filter(t => t.area_id === a.id)
        const areaActive = areaTables.some(t => t.status !== 'empty' || !!t.merged_group_id)
        return (
          <TouchAreaSurface
            key={a.id}
            areaId={a.id}
            className="p-5 border shadow-sm bg-background transition-colors"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDropOnArea(e, a.id)}
          >
            <div className="mb-4 flex items-center justify-between border-b pb-2">
              <div>
                <AnimatedHeading as="h2" className="text-base font-bold text-foreground">{a.name}</AnimatedHeading>
                <p className="text-[11px] text-muted-foreground">Khu vực chứa {areaTables.length} bàn ăn</p>
              </div>
              <Button disabled={!canManageAreas || areaActive} title={areaActive ? "Khu vực có bàn đang hoạt động hoặc ghép nhóm; không thể xóa." : "Xóa khu vực"} size="sm" variant="ghost" onClick={() => delArea(a.id)} className="hover:bg-destructive/10 h-8 w-8 p-0">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 min-h-[80px] p-2 rounded-xl bg-muted/20 border border-dashed border-muted-foreground/20">
              {areaTables.map(t => {
                const isGrouped = !!t.merged_group_id
                const isColorRestricted = t.status !== 'empty'
                const shouldBlockDrag = isColorRestricted || isGrouped
                const isCurrentDragged = draggedTableId === t.id

                return (
                  <TouchTableSurface
                    key={t.id}
                    tableId={t.id}
                    disabledDrag={!canMoveTables || shouldBlockDrag || moveBusy}
                    draggable={canMoveTables && !shouldBlockDrag && !moveBusy}
                    onDragEnd={() => setDraggedTableId(null)}
                    onDragStart={(e) => handleDragStart(e, t)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDropOnTable(e, t)}
                    className={cn(
                      'flex items-center justify-between rounded-xl border-2 p-3 text-sm font-semibold shadow-sm transition-all select-none relative overflow-hidden',
                      STATUS_BG[t.status] || 'bg-gray-100 text-gray-800',
                      isCurrentDragged && 'opacity-30 border-primary border-dashed scale-95',
                      shouldBlockDrag ? 'cursor-not-allowed opacity-90' : 'cursor-grab active:cursor-grabbing border-border'
                    )}
                  >
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="font-bold tracking-tight flex items-center gap-1">
                        {t.name}
                        {isGrouped && <Link2 className="h-3 w-3 text-primary animate-pulse shrink-0" />}
                      </span>
                      <span className={cn("text-[10px] font-normal truncate", isColorRestricted ? "text-white/90" : "text-muted-foreground")}>
                        {isGrouped && t.status === 'empty' ? 'Đã ghép nhóm' : `${t.seats} chỗ`} • STT:{t.sort_order || 0}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => delTable(t.id)}
                      className={cn("rounded-full p-1 transition-colors shrink-0 ml-1", shouldBlockDrag ? "hidden" : "text-muted-foreground hover:text-destructive hover:bg-muted")}
                      disabled={shouldBlockDrag}
                      onMouseDown={event => event.stopPropagation()}
                      onTouchStart={event => event.stopPropagation()}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </TouchTableSurface>
                )
              })}
            </div>

            <div className="mt-4 flex gap-2 items-center border-t pt-3">
              <Input
                className="max-w-40 h-9 text-xs"
                placeholder="Tên bàn ăn mới"
                value={newTable[a.id]?.name ?? ''}
                onChange={(e) => setNewTable(s => ({ ...s, [a.id]: { ...(s[a.id] ?? { seats: 4 }), name: e.target.value } }))}
              />
              <Input
                className="w-20 h-9 text-xs"
                type="number"
                placeholder="Số ghế"
                value={newTable[a.id]?.seats ?? 4}
                min="1" step="1" max="1000"
                onChange={(e) => setNewTable(s => ({ ...s, [a.id]: { ...(s[a.id] ?? { name: '' }), seats: e.target.value } }))}
              />
              <Button size="sm" onClick={() => addTable(a.id)} className="h-9 text-xs"><Plus className="mr-1 h-3.5 w-3.5" />Tạo bàn</Button>
            </div>
          </TouchAreaSurface>
        )
      })}
    </div>
    </TouchTableDnd>
  )
}
