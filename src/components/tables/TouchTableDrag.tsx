import { DndContext,DragOverlay,TouchSensor,pointerWithin,rectIntersection,useDraggable,useDroppable,useSensor,useSensors,type CollisionDetection } from '@dnd-kit/core'
import { useCallback,type HTMLAttributes,type ReactNode } from 'react'
import { Card } from '@/components/ui/card'

type TouchDropTarget = { kind: 'table' | 'area'; id: string }
const collision: CollisionDetection = args => {
  const hits = args.pointerCoordinates ? pointerWithin(args) : rectIntersection(args)
  const tables = hits.filter(hit => args.droppableContainers.find(container => container.id === hit.id)?.data.current?.kind === 'table')
  return tables.length ? tables : hits
}

// Native HTML drag events remain in use for the desktop mouse. This context handles touch only.
export function TouchTableDnd({ children,overlay,onStart,onOver,onEnd,onCancel }: {
  children: ReactNode; overlay: ReactNode; onStart: (id: string) => void;
  onOver?: (id: string | null) => void; onEnd: (source: string,target: TouchDropTarget | null) => void; onCancel: () => void
}) {
  const sensors = useSensors(useSensor(TouchSensor,{ activationConstraint: { delay: 200,tolerance: 10 } }))
  return <DndContext sensors={sensors} collisionDetection={collision}
    onDragStart={({ active }) => onStart(String(active.id))}
    onDragOver={({ over }) => onOver?.(over?.data.current?.kind === 'table' ? String(over.id) : null)}
    onDragCancel={onCancel}
    onDragEnd={({ active,over }) => { const target = over?.data.current; onEnd(String(active.id),target?.kind ? { kind: target.kind,id: target.id } : null) }}>
    {children}
    <DragOverlay dropAnimation={null} zIndex={100}>{overlay}</DragOverlay>
  </DndContext>
}

export function TouchTableSurface({ tableId,disabledDrag,children,style,...props }: HTMLAttributes<HTMLDivElement> & { tableId: string; disabledDrag: boolean }) {
  const { setNodeRef: setDragRef,listeners } = useDraggable({ id: tableId,disabled: disabledDrag })
  const { setNodeRef: setDropRef } = useDroppable({ id: tableId,data: { kind: 'table',id: tableId } })
  const setRef = useCallback((node: HTMLDivElement | null) => { setDragRef(node); setDropRef(node) },[setDragRef,setDropRef])
  return <div ref={setRef} {...listeners} {...props} style={{ touchAction: 'pan-y',WebkitUserSelect: 'none',...style }}>{children}</div>
}

export function TouchAreaSurface({ areaId,...props }: HTMLAttributes<HTMLDivElement> & { areaId: string }) {
  const { setNodeRef } = useDroppable({ id: `area:${areaId}`,data: { kind: 'area',id: areaId } })
  return <Card ref={setNodeRef} {...props}/>
}
