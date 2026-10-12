import { AnimatedHeading } from '@/components/TypographyMotion'
import { OrderPanel,PayPanel,ServedPanel } from '@/components/tables/TablePanels'
import { TablesGrid } from '@/components/tables/TablesGrid'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog,DialogContent,DialogHeader,DialogTitle } from '@/components/ui/dialog'
import { RestaurantTable,STATUS_LABEL,useTables } from '@/hooks/useTables'
import { readableError,releaseTables } from '@/lib/restaurantTransactions'
import { unmergeGroup } from '@/lib/tableGroupActions'
import { BellRing,CheckCircle2,CreditCard,Plus,Unlink } from 'lucide-react'
import { useEffect,useState } from 'react'
import { toast } from '@/lib/notifications'

export default function StaffTables() {
  const [selected, setSelected] = useState<RestaurantTable | null>(null)
  
  // SỬA TẠI ĐÂY: Lấy thêm hàm reload từ hook useTables để làm mới sơ đồ thời gian thực
  const { tables, reload, loading, error } = useTables()
  const current = selected && !loading && !error ? tables.find(t => t.id === selected.id) ?? null : selected

  return (
    <div>
      <TablesGrid
        onSelectTable={setSelected}
        header={
          <div>
            <AnimatedHeading as="h1" className="text-xl font-bold md:text-2xl">Sơ đồ bàn</AnimatedHeading>
            <p className="mt-1 text-xs text-muted-foreground">
              💡 Nhấn giữ &amp; kéo để ghép bàn. Nhấn vào bàn để mở thao tác.
            </p>
          </div>
        }
      />
      <TableActionDialog
        table={current}
        onClose={() => setSelected(null)}
        peers={current?.merged_group_id ? tables.filter(x => x.merged_group_id === current.merged_group_id && x.id !== current.id) : []}
        onReload={reload} // Truyền hàm reload xuống Dialog hành động
      />
    </div>
  )
}

function TableActionDialog({ table, onClose, peers, onReload }: {
  table: RestaurantTable | null; onClose: () => void; peers: RestaurantTable[]; onReload: () => void
}) {
  const [mode, setMode] = useState<'menu' | 'order' | 'served' | 'pay' | null>(null)
  useEffect(() => {
  if (!table?.id) return
  if (table?.status === 'empty') setMode('order')
  else setMode(null)  // serving/awaiting_payment/needs_cleanup → hiện hub
}, [table?.id, table?.status])  // ← thêm status vào dependency
  if (!table) return null
  const close = () => { setMode(null); onClose() }

 const cleanup = async () => {
  try { await releaseTables(table.id, true) }
  catch (error: unknown) { toast.error(readableError(error)); return }
  onReload()   // ← đã có khi merged_group_id, giờ chuyển ra ngoài if để luôn chạy
  toast.success('Đã dọn xong → Bàn trống')
  close()
}
  const groupBanner = table.merged_group_id && (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-xs">
      <span>🔗 Đã ghép với: <b>{peers.map(p => p.name).join(', ') || '—'}</b></span>
      {table.status === 'empty' && (
        <Button size="sm" variant="outline" onClick={async () => { 
          await unmergeGroup(table.merged_group_id!)
          onReload() // SỬA TẠI ĐÂY: Ép hệ thống tải lại sơ đồ bàn ngay sau khi tách nhóm thành công
          close() 
        }}>
          <Unlink className="mr-1 h-3 w-3" />Tách
        </Button>
      )}
    </div>
  )

  return (
    <Dialog open={!!table} onOpenChange={(o) => !o && close()}>
      {/* CHỈNH SỬA TẠI ĐÂY: Mở rộng không gian hiển thị tự động co giãn theo thiết bị, chống tràn màn hình */}
      <DialogContent className="w-full max-w-[95vw] md:max-w-3xl p-0 overflow-hidden rounded-xl border shadow-lg bg-background">
        {mode === 'order' && <OrderPanel table={table} onDone={close} />}
        {mode === 'served' && <ServedPanel table={table} onBack={() => setMode(null)} />}
        {mode === 'pay' && <PayPanel table={table} onBack={() => setMode(null)} onDone={close} />}
        {!mode && (
          <div className="p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {table.name}
                <Badge variant="secondary">{STATUS_LABEL[table.status]}</Badge>
              </DialogTitle>
            </DialogHeader>
            {groupBanner && <div className="mt-3">{groupBanner}</div>}
            <div className="mt-4 space-y-2">
              {table.status === 'empty' && (
                <Button className="h-12 w-full text-base" onClick={() => setMode('order')}>
                  <Plus className="mr-2 h-5 w-5" />Order
                </Button>
              )}
              {table.status === 'serving' && (
                <>
                  <Button className="h-12 w-full text-base" onClick={() => setMode('order')}>
                    <Plus className="mr-2 h-5 w-5" />Order thêm
                  </Button>
                  <Button variant="secondary" className="h-12 w-full text-base" onClick={() => setMode('served')}>
                    <BellRing className="mr-2 h-5 w-5" />Món bếp đã xong
                  </Button>
                  <Button variant="outline" className="h-12 w-full text-base" onClick={() => setMode('pay')}>
                    <CreditCard className="mr-2 h-5 w-5" />Thanh toán
                  </Button>
                </>
              )}
              {table.status === 'awaiting_payment' && (
                <p className="rounded-lg border bg-muted/40 p-4 text-center text-sm text-muted-foreground">
                  Đang chờ thu ngân xác nhận đã nhận tiền.
                </p>
              )}
              {table.status === 'needs_cleanup' && (
                <Button className="h-12 w-full text-base" onClick={cleanup}>
                  <CheckCircle2 className="mr-2 h-5 w-5" />Đã dọn xong → Bàn trống
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
