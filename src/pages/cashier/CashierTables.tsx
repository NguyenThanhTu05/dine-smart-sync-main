import { useEffect, useMemo, useState } from 'react'
import { useTables, RestaurantTable, STATUS_LABEL } from '@/hooks/useTables'
import { useAuth } from '@/contexts/AuthContext'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/integrations/supabase/client'
import { formatVND } from '@/hooks/useGlobalCounts'
import { Receipt, CheckCircle2, Unlink, Plus, BellRing, CreditCard, ChevronLeft } from 'lucide-react'
import { toast } from 'sonner'
import { OrderPanel, ServedPanel, PayPanel } from '@/components/tables/TablePanels'
import { findGroupOpenOrderId, updateGroupStatus } from '@/lib/tableGroup'
import { TablesGrid, unmergeGroup } from '@/components/tables/TablesGrid'
import { printBill } from '@/lib/printBill'

export default function CashierTables() {
  const { tables, reload } = useTables()
  const [sel, setSel] = useState<RestaurantTable | null>(null)

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
    if (!table) return setMode(null)
    if (table.status === 'empty') setMode('order')
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
  const { user } = useAuth()
  const [order, setOrder] = useState<any>(null)
  const [cashierName, setCashierName] = useState('')
  const [settings, setSettings] = useState({ vat_percent: 0, service_percent: 0, global_discount_percent: 0 })
  useEffect(() => {
    if (user?.id) {
      Promise.all([
        supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
        supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle(),
      ]).then(([{ data: p }, { data: r }]) => {
        const ROLE_LABEL: Record<string, string> = {
          staff: 'Nhân viên', admin: 'Quản lý', cashier: 'Thu ngân', kitchen: 'Bếp',
        }
        const name = p?.full_name ?? ''
        const role = r?.role ? (ROLE_LABEL[r.role] ?? r.role) : ''
        setCashierName(role ? `${role} - ${name}` : name)
      })
    }
  }, [user?.id])

  useEffect(() => {
    supabase.from('payment_settings').select('vat_percent, service_percent, global_discount_percent')
      .eq('id', 1).maybeSingle()
      .then(({ data }) => {
        if (data) setSettings({ vat_percent: data.vat_percent ?? 0, service_percent: data.service_percent ?? 0, global_discount_percent: data.global_discount_percent ?? 0 })
      })
  }, [])

  useEffect(() => {
    ; (async () => {
      const orderId = await findGroupOpenOrderId(table)
      if (!orderId) return setOrder(null)
      const { data } = await supabase.from('orders').select('*, order_items(*)').eq('id', orderId).maybeSingle()
      setOrder(data)
    })()
  }, [table.id])

  const subtotal = useMemo(() => {
    if (!order?.order_items) return 0
    return order.order_items.reduce((sum: number, it: any) =>
      sum + (it.price_snapshot * it.quantity), 0)
  }, [order?.order_items])

  const { svcFee, vatFee, discountAmt, effectivePct, finalTotal } = useMemo(() => {
    const svcFee = Math.round(subtotal * (settings.service_percent / 100))
    const afterSvc = subtotal + svcFee
    const vatFee = Math.round(afterSvc * (settings.vat_percent / 100))
    const afterVAT = afterSvc + vatFee
    const tablePct  = order?.discount_percent ?? 0
    const globalPct = settings.global_discount_percent ?? 0
    const effectivePct = tablePct > 0 ? tablePct : globalPct
    const discountAmt = Math.round(afterVAT * (effectivePct / 100))
    return { svcFee, vatFee, discountAmt, effectivePct, finalTotal: afterVAT - discountAmt }
    //                                    ↑ thêm vào đây
}, [subtotal, settings, order?.discount_percent])

  const confirm = async () => {
    if (!order) return
    const cashierTag = `[Người thu: ${cashierName || 'Thu ngân'}]`
    const updatedNotes = order.notes ? `${order.notes}\n${cashierTag}` : cashierTag
    await supabase.from('orders').update({
      is_paid: true,
      paid_at: new Date().toISOString(),
      total: subtotal,           // giữ subtotal, finalTotal tự tính khi cần
      notes: updatedNotes,
    }).eq('id', order.id)
    await updateGroupStatus(table, 'needs_cleanup')
    onReload()
    toast.success('Đã xác nhận thanh toán → Bàn chờ dọn')
    onClose()
  }

  if (!order) return <p className="mt-4 text-sm text-muted-foreground">Bàn chưa có hóa đơn.</p>
  return (
    <div className="mt-4 space-y-3">
      <div className="space-y-1 text-sm">
        {(order.order_items ?? []).map((it: any) => (
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
        <Button onClick={confirm}>
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
    await updateGroupStatus(table, 'empty')
    if (table.merged_group_id) await unmergeGroup(table.merged_group_id)
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
