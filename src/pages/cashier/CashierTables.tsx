import { OrderPanel,PayPanel,ServedPanel } from '@/components/tables/TablePanels'
import { TablesGrid } from '@/components/tables/TablesGrid'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog,DialogContent,DialogHeader,DialogTitle } from '@/components/ui/dialog'
import { useOrderSync } from '@/hooks/useOrderSync'
import { RestaurantTable,STATUS_LABEL,useTables } from '@/hooks/useTables'
import type { Order } from '@/lib/domainTypes'
import { formatVND } from '@/lib/formatVND'
import { readOpenOrder } from '@/lib/openOrder'
import { payOrder,quoteOrder,readableError,releaseTables,type PaymentQuote } from '@/lib/restaurantTransactions'
import { unmergeGroup } from '@/lib/tableGroupActions'
import { BellRing,CheckCircle2,ChevronLeft,CreditCard,Plus,Unlink } from 'lucide-react'
import { useEffect,useState } from 'react'
import { toast } from 'sonner'

export default function CashierTables() {
  const { tables, reload, loading, error } = useTables()
  const [selection, setSel] = useState<RestaurantTable | null>(null)
  const sel = selection && !loading && !error ? tables.find(t => t.id === selection.id) ?? null : selection

  const peers = sel?.merged_group_id
    ? tables.filter(x => x.merged_group_id === sel.merged_group_id && x.id !== sel.id)
    : []

  return (
    <div>
      <TablesGrid
        onSelectTable={setSel}
        header={
          <div>
            <h1 className="text-xl font-bold md:text-2xl">Sơ đồ bàn</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              💡 <b>Nhấn giữ &amp; kéo</b> bàn để ghép. Nhấn vào bàn để mở thao tác.
            </p>
          </div>
        }
      />
      <CashierTableDialog
        table={sel}
        onClose={() => setSel(null)}
        peers={peers}
        onReload={reload}
      />
    </div>
  )
}

type Mode = 'hub' | 'order' | 'served' | 'pay' | null

function CashierTableDialog({ table, onClose, peers, onReload }: {
  table: RestaurantTable | null
  onClose: () => void
  peers: RestaurantTable[]
  onReload: () => void
}) {
  const [mode, setMode] = useState<Mode>(null)

  useEffect(() => {
    if (!table?.id) return setMode(null)
    if (table?.status === 'empty') setMode('order')
    else setMode('hub')
  }, [table?.id, table?.status])

  if (!table) return null
  const close = () => { setMode(null); onClose() }

  const groupBanner = table.merged_group_id && (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-xs">
      <span>🔗 Đã ghép với: <b>{peers.map(p => p.name).join(', ') || '—'}</b></span>
      {table.status === 'empty' && (
        <Button size="sm" variant="outline" onClick={async () => {
          await unmergeGroup(table.merged_group_id!)
          onReload()
          close()
        }}>
          <Unlink className="mr-1 h-3 w-3" />Tách bàn
        </Button>
      )}
    </div>
  )

  return (
    <Dialog open={!!table} onOpenChange={(o) => !o && close()}>
      <DialogContent className="w-full max-w-[95vw] md:max-w-3xl p-0 overflow-hidden rounded-xl border shadow-lg bg-background [&>button]:hidden">
        {mode === 'order' && (
          <div>
            {groupBanner && <div className="p-3 pb-0">{groupBanner}</div>}
            {table.status === 'serving' && (
              <div className="px-3 pt-3">
                <Button variant="ghost" size="sm" onClick={() => setMode('hub')}>
                  <ChevronLeft className="mr-1 h-4 w-4" />Quay lại
                </Button>
              </div>
            )}
            <OrderPanel table={table} onDone={close} />
          </div>
        )}
        {mode === 'served' && (
          <div>
            <div className="px-3 pt-3">
              <Button variant="ghost" size="sm" onClick={() => setMode('hub')}>
                <ChevronLeft className="mr-1 h-4 w-4" />Quay lại
              </Button>
            </div>
            <ServedPanel table={table} onBack={() => setMode('hub')} />
          </div>
        )}
        {mode === 'pay' && (
          <div>
            <div className="px-3 pt-3">
              <Button variant="ghost" size="sm" onClick={() => setMode('hub')}>
                <ChevronLeft className="mr-1 h-4 w-4" />Quay lại
              </Button>
            </div>
            <PayPanel table={table} onBack={() => setMode('hub')} onDone={close} />
          </div>
        )}
        {mode === 'hub' && (
          <div className="p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {table.name}
                <Badge variant="secondary">{STATUS_LABEL[table.status]}</Badge>
              </DialogTitle>
            </DialogHeader>
            {groupBanner && <div className="mt-3">{groupBanner}</div>}
            {table.status === 'serving' && (
              <div className="mt-4 grid gap-2">
                <Button className="h-14 text-base" onClick={() => setMode('order')}>
                  <Plus className="mr-2 h-5 w-5" />Order thêm
                </Button>
                <Button variant="secondary" className="h-14 text-base" onClick={() => setMode('served')}>
                  <BellRing className="mr-2 h-5 w-5" />Món (xem trạng thái)
                </Button>
                <Button variant="outline" className="h-14 text-base" onClick={() => setMode('pay')}>
                  <CreditCard className="mr-2 h-5 w-5" />Thanh toán
                </Button>
              </div>
            )}
            {table.status === 'awaiting_payment' && (
              <CashierConfirmPay table={table} onClose={close} onReload={onReload} />
            )}
            {table.status === 'needs_cleanup' && (
              <CleanupPanel table={table} onClose={close} onReload={onReload} />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function CashierConfirmPay({ table, onClose, onReload }: {
  table: RestaurantTable
  onClose: () => void
  onReload: () => void
}) {
  const [order, setOrder] = useState<Order | null>(null)
  const [quote, setQuote] = useState<PaymentQuote | null>(null)
  const [isPaying, setIsPaying] = useState(false)
  const settings = { vat_percent: quote?.vat_percent ?? 0, service_percent: quote?.service_percent ?? 0 }
  useOrderSync(async (canCommit) => {
    try {
      const current = await readOpenOrder(table)
      const freshQuote = current ? await quoteOrder(current.id) : null
      if (!canCommit()) return
      setOrder(current && freshQuote ? { ...current, order_items: freshQuote.items } : null)
      setQuote(freshQuote)
    } catch (error: unknown) {
      if (!canCommit()) return
      setOrder(null)
      setQuote(null)
      toast.error(error instanceof Error ? error.message : 'Không thể tải hóa đơn.')
    }
  }, `${table.id}:${table.merged_group_id ?? ''}`)

  const subtotal = quote?.subtotal ?? 0
  const svcFee = quote?.service_fee ?? 0
  const vatFee = quote?.vat_fee ?? 0
  const discountAmt = quote?.discount_amount ?? 0
  const effectivePct = quote?.discount_percent ?? 0
  const finalTotal = quote?.total ?? 0
  const confirm = async () => {
    if (!order || !quote || isPaying) return
    setIsPaying(true)
    try {
      await payOrder(order.id, order.payment_method === 'cash' ? 'confirm_cash' : 'confirm_qr', quote.fingerprint)
      onReload()
      toast.success('Đã xác nhận thanh toán → Bàn chờ dọn')
      onClose()
    } catch (error: unknown) {
      toast.error(readableError(error))
      try {
        const current = await readOpenOrder(table)
        const freshQuote = current ? await quoteOrder(current.id) : null
        setOrder(current && freshQuote ? { ...current, order_items: freshQuote.items } : null); setQuote(freshQuote)
      } catch (refreshError: unknown) { setOrder(null); setQuote(null); toast.error(readableError(refreshError)) }
    } finally { setIsPaying(false) }
  }

  if (!order) return <p className="mt-4 text-sm text-muted-foreground">Bàn chưa có hóa đơn.</p>
  return (
    <div className="mt-4 space-y-3">
      <div className="space-y-1 text-sm">
        {(order.order_items ?? []).map((it) => (
          <div key={it.id} className="flex justify-between">
            <span>{it.name_snapshot} × {it.quantity}</span>
            <span className="tabular-nums">{formatVND(it.price_snapshot * it.quantity)}</span>
          </div>
        ))}
        <div className="mt-3 space-y-1 border-t pt-2 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>Tạm tính</span>
            <span>{formatVND(subtotal)}</span>
          </div>
          {settings.service_percent > 0 && (
            <div className="flex justify-between">
              <span>Phí dịch vụ ({settings.service_percent}%)</span>
              <span>{formatVND(svcFee)}</span>
            </div>
          )}
          {settings.vat_percent > 0 && (
            <div className="flex justify-between">
              <span>VAT ({settings.vat_percent}%)</span>
              <span>{formatVND(vatFee)}</span>
            </div>
          )}
          {effectivePct > 0 && (
            <div className="flex justify-between text-red-600 font-semibold">
              <span>Giảm giá ({effectivePct}%)</span>
              <span>-{formatVND(discountAmt)}</span>
            </div>
          )}
        </div>
        <div className="flex justify-between border-t pt-2 text-base font-bold">
          <span>Tổng thanh toán</span>
          <span className="text-primary">{formatVND(finalTotal)}</span>
        </div>
        {/* <div className="text-xs text-muted-foreground">
          Phương thức: <b>{order.payment_method === 'qr' ? 'QR Chuyển khoản' : 'Tiền mặt'}</b>
        </div> */}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={onClose}>
          <ChevronLeft className="mr-1 h-4 w-4" />Quay lại
        </Button>
        <Button onClick={confirm} disabled={!quote || isPaying}>
          <CheckCircle2 className="mr-1 h-4 w-4" />Xác nhận
        </Button>
      </div>
    </div>
  )
}

function CleanupPanel({ table, onClose, onReload }: {
  table: RestaurantTable
  onClose: () => void
  onReload: () => void
}) {
  const cleanup = async () => {
    try { await releaseTables(table.id, true) }
    catch (error: unknown) { toast.error(readableError(error)); return }
    onReload() // ← patch UI ngay cho người thực hiện lệnh
    toast.success('Đã dọn xong → Bàn trống')
    onClose()
  }
  return (
    <div className="mt-4">
      <Button className="h-14 w-full text-base" onClick={cleanup}>
        <CheckCircle2 className="mr-2 h-5 w-5" />Dọn xong → Bàn trống
      </Button>
    </div>
  )
}
