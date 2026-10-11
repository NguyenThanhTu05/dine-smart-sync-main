import { readOrderItems } from '@/lib/readOrderItems'
import type { BillItem,Order } from '@/lib/domainTypes';
import { billDisplayAmount,invoiceAmounts,paymentQuoteSchema } from '@/lib/invoiceAmounts';
import { subscribeOrderChanges } from '@/lib/orderSync';
import { toast } from 'sonner';
import { vietnamDayRange } from '../../../supabase/functions/_shared/vietnamTime';
type BillRow = Order & {_displayName:string;_areaName:string|null;_isGroup:boolean}
// TypeScript / React
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs,TabsList,TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { formatVND } from '@/lib/formatVND';
import { printBill } from '@/lib/printBill';
import { format,parseISO } from 'date-fns';
import { Receipt,Search } from 'lucide-react';
import { useEffect,useState } from 'react';

type Mode = 'open' | 'today' | 'past'

export default function BillsPage() {
  const [mode, setMode] = useState<Mode>('open')
  const [rows, setRows] = useState<BillRow[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSearch, setActiveSearch] = useState('')

  const [settings, setSettings] = useState({ vat_percent: 0, service_percent: 0, global_discount_percent: 0 })
  useEffect(() => {
    supabase
      .from('payment_settings')
      .select('vat_percent, service_percent, global_discount_percent')
      .eq('id', 1)
      .single()
      .then(({ data }) => {
        if (data) {
          setSettings({
            vat_percent: data.vat_percent ?? 0,
            service_percent: data.service_percent ?? 0,
            global_discount_percent: data.global_discount_percent ?? 0
          })
        }
      })
  }, [])

  useEffect(() => {
    setSearchQuery('');
    setActiveSearch('');

    let active = true, version = 0
    const fetchData = async () => {
    const request = ++version
    try {
    let q = supabase
      .from('orders')
        .select('*, restaurant_tables(name, merged_group_id, areas(name))')
        .order('created_at', { ascending: false }).order('id')

      if (mode === 'open') q = q.eq('is_paid', false)
      else if (mode === 'today') {
        const { start, end } = vietnamDayRange()
        q = q.eq('is_paid', true).gte('paid_at', start).lt('paid_at', end)
      } else {
        const { start } = vietnamDayRange()
        q = q.eq('is_paid', true).lt('paid_at', start)
      }
      const orders: Order[] = []
      for (let offset=0; ;offset+=1000) {
        const { data, error } = await q.range(offset,offset+999)
        if (error) throw error
        orders.push(...(data ?? []).map(order => ({ ...order, order_items: [] })))
        if ((data?.length ?? 0)<1000) break
      }
      const rawOrders = orders.filter(order => !order.is_paid || !paymentQuoteSchema.safeParse(order.payment_snapshot).success)
      const rawItems = await readOrderItems(rawOrders.map(order => order.id))
      for (const order of rawOrders) order.order_items = rawItems.get(order.id) ?? []
      const groupIds = Array.from(new Set(
        orders.map((o) => o.restaurant_tables?.merged_group_id).filter((id): id is string => !!id)
      ))

      const groupNameMap: Record<string, string> = {}
      const groupAreaMap: Record<string, string> = {}

      if (groupIds.length) {
        const { data: gt, error: groupError } = await supabase
          .from('restaurant_tables')
          .select('name, merged_group_id, sort_order, areas(name)')
          .in('merged_group_id', groupIds)
          .order('sort_order')

        if (groupError) throw groupError
        for (const r of gt ?? []) {
          if (!r.merged_group_id) continue
          groupNameMap[r.merged_group_id] = groupNameMap[r.merged_group_id]
            ? `${groupNameMap[r.merged_group_id]} + ${r.name}`
            : r.name
          if (r.areas?.name && !groupAreaMap[r.merged_group_id]) {
            groupAreaMap[r.merged_group_id] = r.areas.name
          }
        }
      }

      const enriched = orders.map((o) => {
        const groupId = o.restaurant_tables?.merged_group_id
        const isGroup = !!groupId
        const areaName = isGroup
          ? (groupAreaMap[groupId ?? ''] || o.restaurant_tables?.areas?.name)
          : o.restaurant_tables?.areas?.name

        const frozen = o.is_paid ? paymentQuoteSchema.safeParse(o.payment_snapshot) : null
        return {
          ...o,
          order_items: frozen?.success ? frozen.data.items : o.order_items,
          _displayName: o.is_paid && paymentQuoteSchema.safeParse(o.payment_snapshot).success
            ? paymentQuoteSchema.parse(o.payment_snapshot).table_name ?? 'Bàn'
            : o.restaurant_tables?.merged_group_id
            ? (groupNameMap[groupId ?? ''] ?? o.restaurant_tables?.name ?? 'Bàn')
            : (o.restaurant_tables?.name ?? 'Bàn'),
          _areaName: areaName || null,
          _isGroup: isGroup,
        }
      })

      if (active && request === version) setRows(enriched)
    } catch (error) {
      if (active && request === version) toast.error((error as {message?: string}).message ?? 'Không tải được hóa đơn')
    }
    }
    void fetchData()
    const stop = subscribeOrderChanges(() => { void fetchData() })
    return () => { active = false; version++; stop() }
}, [mode])
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setActiveSearch(searchQuery.trim())
  }

  const filteredRows = rows.filter((o) => {
    if (!activeSearch) return true
    return o.id?.toLowerCase().includes(activeSearch.toLowerCase())
  })

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-bold">Bill Order</h1>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <TabsList>
            <TabsTrigger value="open">Chưa hoàn thành</TabsTrigger>
            <TabsTrigger value="today">Đã hoàn thành</TabsTrigger>
            <TabsTrigger value="past">Đã qua</TabsTrigger>
          </TabsList>
        </Tabs>

        <form onSubmit={handleSearchSubmit} className="flex items-center gap-1.5 w-full sm:max-w-xs">
          <Input
            placeholder="Tìm kiếm số hóa đơn..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 text-xs flex-1"
          />
          <Button type="submit" size="sm" className="h-9 px-3 shrink-0">
            <Search className="h-3.5 w-3.5" />
          </Button>
        </form>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filteredRows.map(o => {
  const amounts = invoiceAmounts(o, settings)
  const displayAmount = billDisplayAmount(o, settings)
  const effectivePct = amounts.discount_percent
  const snapshotResult = paymentQuoteSchema.safeParse(o.payment_snapshot)
  const snapshot = snapshotResult.success ? snapshotResult.data : null
  return (
          <Card key={o.id} className="p-4 flex flex-col justify-between min-h-[180px]">
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-bold flex flex-wrap items-center gap-1.5 leading-tight">
                    <span className="text-sm md:text-base text-foreground">{snapshot?.table_name ?? o._displayName}</span>
                    <span className="text-[10px] text-muted-foreground font-normal">#{o.id?.slice(0, 8)}</span>

                    {o._areaName && (
                      <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground border border-border">
                        📍 {o._areaName}
                      </span>
                    )}

                    {o._isGroup && <Badge variant="outline" className="text-[9px] bg-primary/5 text-primary border-primary/20">Ghép</Badge>}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{format(parseISO(o.created_at), 'dd/MM HH:mm')}</div>
                </div>
                <Badge variant={o.is_paid ? 'secondary' : 'default'}>{o.is_paid ? 'Đã TT' : 'Mở'}</Badge>
              </div>

              <div className="mt-3 space-y-1 text-xs max-h-40 overflow-y-auto pr-1 scrollbar-thin">
                {Object.values(
                  o.order_items.reduce<Record<string,BillItem>>((acc, it) => {
                    const key = `${it.name_snapshot}__${it.price_snapshot}`
                    if (acc[key]) {
                      acc[key].quantity += Number(it.quantity)
                    } else {
                      acc[key] = { ...it, quantity: Number(it.quantity) }
                    }
                    return acc
                  }, {})
                ).map((it) => (
                  <div key={it.id} className="flex justify-between items-center gap-2 py-0.5 border-b border-dashed border-muted last:border-0">
                    <span className="truncate text-muted-foreground font-medium">
                      <span className="text-foreground font-semibold">{it.name_snapshot}</span> × {it.quantity}
                    </span>
                    <span className="tabular-nums shrink-0">{formatVND(it.price_snapshot * it.quantity)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="mt-3 flex flex-col gap-1 border-t pt-2">
                {(amounts.service_percent > 0 || amounts.vat_percent > 0 || amounts.discount_percent > 0) && (
                  <div className="flex justify-between text-[10px] text-muted-foreground px-0.5">
                    <span>Tạm tính: {formatVND(
  amounts.subtotal
)}</span>
                    <span>
                      {effectivePct > 0 && `Giảm: ${effectivePct}% `}
                      {amounts.service_percent > 0 && `• Phí DV: ${amounts.service_percent}% `}
                      {amounts.vat_percent > 0 && `• VAT: ${amounts.vat_percent}%`}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-sm font-bold text-primary">
                    <span className="text-xs font-normal text-muted-foreground mr-1">{displayAmount.usesStoredAmount ? 'Số tiền gốc:' : 'Tổng thanh toán:'}</span>
                    {displayAmount.value === null ? '—' : formatVND(displayAmount.value)}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => printBill(o.id, { overridePaymentMethod: o.payment_method ?? undefined })}
                  >
                    <Receipt className="mr-1 h-3 w-3" />In
                  </Button>
                </div>
              </div>

              {displayAmount.usesStoredAmount && (
                <p className="mt-1 text-[10px] text-muted-foreground">Hóa đơn cũ: số tiền đã lưu, chưa đủ thông tin VAT/phí/giảm giá.</p>
              )}
              {o.notes && (
                <div className="mt-2 rounded bg-muted p-2 text-xs text-destructive font-medium whitespace-pre-line">
                  {o.notes}
                </div>
              )}
            </div>
          </Card>
        )
})}

        {filteredRows.length === 0 && (
          <p className="col-span-full p-8 text-center text-sm text-muted-foreground">
            Không có bill nào.
          </p>
        )}
      </div>
    </div>
  )
}
