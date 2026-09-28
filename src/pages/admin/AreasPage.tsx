import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useTables, RestaurantTable } from '@/hooks/useTables'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Trash2, Plus, Link2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { getSharedBroadcastChannel } from '@/lib/tableGroup'

const STATUS_BG: Record<string, string> = {
  empty: 'bg-gray-100 text-gray-800 border-gray-300 hover:bg-gray-200/80',
  serving: 'bg-green-500 text-white border-green-600',
  awaiting_payment: 'bg-red-500 text-white border-red-600',
  needs_cleanup: 'bg-orange-500 text-white border-orange-600',
}

export default function AreasPage() {
  const { areas: hookAreas, tables: hookTables, reload } = useTables()
  const [newArea, setNewArea] = useState('')
  const [newTable, setNewTable] = useState<Record<string, { name: string; seats: number }>>({})
  const [draggedTableId, setDraggedTableId] = useState<string | null>(null)

  const safeAreas = (hookAreas || []) as any[]
  const safeTables = (hookTables || []) as any[]
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
    if (!newArea) return
    await supabase.from('areas').insert({ name: newArea, sort_order: safeAreas.length + 1 })
    setNewArea('')
    reload()
    await broadcastLayoutChange()
  }

  const delArea = async (id: string) => {
    if (!confirm('Xóa khu vực này?')) return
    await supabase.from('areas').delete().eq('id', id)
    reload()
    await broadcastLayoutChange()
  }

  const addTable = async (areaId: string) => {
    const v = newTable[areaId]
    if (!v?.name) return
    const currentAreaTables = sortedTables.filter(t => t.area_id === areaId)
    await supabase.from('restaurant_tables').insert({
      area_id: areaId,
      name: v.name,
      seats: v.seats || 4,
      sort_order: currentAreaTables.length + 1,
    })
    setNewTable(s => ({ ...s, [areaId]: { name: '', seats: 4 } }))
    reload()
    await broadcastLayoutChange()
  }

  const delTable = async (id: string) => {
    if (!confirm('Xóa bàn này?')) return
    await supabase.from('restaurant_tables').delete().eq('id', id)
    reload()
    await broadcastLayoutChange()
  }

  const handleDragStart = (e: React.DragEvent, table: RestaurantTable) => {
    if (table.status !== 'empty') {
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

  const handleDropOnArea = async (e: React.DragEvent, targetAreaId: string) => {
    e.preventDefault()
    const tableId = e.dataTransfer.getData('text/plain') || draggedTableId
    if (!tableId) return

    const table = sortedTables.find(t => t.id === tableId)
    if (!table) return
    if (table.area_id === targetAreaId) return

    const targetAreaTablesCount = sortedTables.filter(t => t.area_id === targetAreaId).length

    const { error } = await supabase
      .from('restaurant_tables')
      .update({
        area_id: targetAreaId,
        sort_order: targetAreaTablesCount + 1,
      })
      .eq('id', tableId)

    if (error) {
      toast.error('Lỗi chuyển khu vực: ' + error.message)
    } else {
      toast.success(`Đã chuyển ${table.name} sang khu vực mới`)
      reload()
      await broadcastLayoutChange()
    }
    setDraggedTableId(null)
  }

  const handleDropOnTable = async (e: React.DragEvent, targetTable: RestaurantTable) => {
    e.stopPropagation()
    e.preventDefault()

    const sourceTableId = e.dataTransfer.getData('text/plain') || draggedTableId
    if (!sourceTableId || sourceTableId === targetTable.id) return

    const sourceTable = sortedTables.find(t => t.id === sourceTableId)
    if (!sourceTable) return

    if (sourceTable.area_id === targetTable.area_id) {
      const sourceOrder = sourceTable.sort_order ?? 0
      const targetOrder = targetTable.sort_order ?? 0

      if (sourceOrder === targetOrder) {
        const areaTables = sortedTables
          .filter(t => t.area_id === sourceTable.area_id)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

        const updates = areaTables.map((t, idx) => ({ id: t.id, sort_order: idx + 1 }))
        const newSourceIdx = updates.findIndex(u => u.id === sourceTable.id)
        const newTargetIdx = updates.findIndex(u => u.id === targetTable.id)

        const tmp = updates[newSourceIdx].sort_order
        updates[newSourceIdx].sort_order = updates[newTargetIdx].sort_order
        updates[newTargetIdx].sort_order = tmp

        await Promise.all(
          updates.map(u => supabase.from('restaurant_tables').update({ sort_order: u.sort_order }).eq('id', u.id))
        )
      } else {
        await Promise.all([
          supabase.from('restaurant_tables').update({ sort_order: targetOrder }).eq('id', sourceTable.id),
          supabase.from('restaurant_tables').update({ sort_order: sourceOrder }).eq('id', targetTable.id),
        ])
      }
      toast.success(`Đã đổi vị trí ${sourceTable.name} ↔ ${targetTable.name}`)
      reload()
      await broadcastLayoutChange()
    } else {
      await supabase.from('restaurant_tables').update({
        area_id: targetTable.area_id,
        sort_order: targetTable.sort_order,
      }).eq('id', sourceTable.id)

      toast.success(`Đã chuyển ${sourceTable.name} sang khu vực của ${targetTable.name}`)
      reload()
      await broadcastLayoutChange()
    }
    setDraggedTableId(null)
  }

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Khu vực &amp; Bàn</h1>
        <p className="text-xs text-muted-foreground mt-1">
          💡 Hướng dẫn: Kéo khối bàn trống độc lập để thay đổi vị trí thứ tự hoặc phân khu. <span className="text-destructive font-semibold">Các bàn đang ăn nhậu hoặc đang được ghép nhóm sẽ bị khóa cứng vị trí kéo thả.</span>
        </p>
      </div>

      <Card className="flex gap-2 p-4 shadow-sm border">
        <Input
          value={newArea}
          onChange={(e) => setNewArea(e.target.value)}
          placeholder="Tên khu vực mới (vd: Tầng lửng, VIP...)"
          className="max-w-md"
        />
        <Button onClick={addArea}><Plus className="mr-1 h-4 w-4" />Thêm khu vực</Button>
      </Card>

      {safeAreas.map((a: { id: string; name: string }) => {
        const areaTables = sortedTables.filter(t => t.area_id === a.id)
        return (
          <Card
            key={a.id}
            className="p-5 border shadow-sm bg-background transition-colors"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDropOnArea(e, a.id)}
          >
            <div className="mb-4 flex items-center justify-between border-b pb-2">
              <div>
                <h2 className="text-base font-bold text-foreground">{a.name}</h2>
                <p className="text-[11px] text-muted-foreground">Khu vực chứa {areaTables.length} bàn ăn</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => delArea(a.id)} className="hover:bg-destructive/10 h-8 w-8 p-0">
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
                  <div
                    key={t.id}
                    draggable={!shouldBlockDrag}
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
                      className={cn("rounded-full p-1 transition-colors shrink-0 ml-1", isColorRestricted ? "hidden" : "text-muted-foreground hover:text-destructive hover:bg-muted")}
                      disabled={isColorRestricted}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
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
                onChange={(e) => setNewTable(s => ({ ...s, [a.id]: { ...(s[a.id] ?? { name: '' }), seats: Number(e.target.value) } }))}
              />
              <Button size="sm" onClick={() => addTable(a.id)} className="h-9 text-xs"><Plus className="mr-1 h-3.5 w-3.5" />Tạo bàn</Button>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
