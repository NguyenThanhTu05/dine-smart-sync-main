// TypeScript / React
import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { formatVND } from '@/hooks/useGlobalCounts'
import { format, parseISO } from 'date-fns'
import { Receipt, Search } from 'lucide-react'
import { printBill } from '@/lib/printBill'

type Mode = 'open' | 'today' | 'past'

export default function BillsPage() {
  const [mode, setMode] = useState<Mode>('open')
  const [rows, setRows] = useState<any[]>([])
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

    const fetchData = async () => {
    let q = supabase
      .from('orders')
        .select('*, restaurant_tables(name, merged_group_id, areas(name)), order_items(*)')
        .order('created_at', { ascending: false })

      if (mode === 'open') q = q.eq('is_paid', false)
      else if (mode === 'today') {
        const start = new Date(); start.setHours(0, 0, 0, 0)
        q = q.eq('is_paid', true).gte('paid_at', start.toISOString())
      } else {
        const start = new Date(); start.setHours(0, 0, 0, 0)
        q = q.eq('is_paid', true).lt('paid_at', start.toISOString())
      }
      const { data } = await q

      const orders = data ?? []
      const groupIds = Array.from(new Set(
        orders.map((o: any) => o.restaurant_tables?.merged_group_id).filter(Boolean)
      ))

      let groupNameMap: Record<string, string> = {}
      let groupAreaMap: Record<string, string> = {}

      if (groupIds.length) {
        const { data: gt } = await supabase
          .from('restaurant_tables')
          .select('name, merged_group_id, sort_order, areas(name)')
          .in('merged_group_id', groupIds)
          .order('sort_order')

        for (const r of (gt ?? []) as any[]) {
          groupNameMap[r.merged_group_id] = groupNameMap[r.merged_group_id]
            ? `${groupNameMap[r.merged_group_id]} + ${r.name}`
            : r.name
          if (r.areas?.name && !groupAreaMap[r.merged_group_id]) {
            groupAreaMap[r.merged_group_id] = r.areas.name
          }
        }
      }

      const enriched = orders.map((o: any) => {
        const isGroup = !!o.restaurant_tables?.merged_group_id
        const areaName = isGroup
          ? (groupAreaMap[o.restaurant_tables.merged_group_id] || o.restaurant_tables?.areas?.name)
          : o.restaurant_tables?.areas?.name

        return {
          ...o,
          _displayName: o.restaurant_tables?.merged_group_id
            ? (groupNameMap[o.restaurant_tables.merged_group_id] ?? o.restaurant_tables?.name)
            : (o.restaurant_tables?.name ?? 'Bàn'),
          _areaName: areaName || null,
          _isGroup: isGroup,
        }
      })

      if (mode === 'open') {
        const byGroup: Record<string, any> = {}
        const result: any[] = []
        for (const o of enriched) {
          const gid = o.restaurant_tables?.merged_group_id
          if (!gid) { result.push(o); continue }
          if (!byGroup[gid]) {
            byGroup[gid] = { ...o, order_items: [...o.order_items], total: Number(o.total) }
            result.push(byGroup[gid])
          } else {
            byGroup[gid].order_items.push(...o.order_items)
            byGroup[gid].total = Number(byGroup[gid].total) + Number(o.total)
            if (o.notes) byGroup[gid].notes = [byGroup[gid].notes, o.notes].filter(Boolean).join(' • ')
          }
        }
        setRows(result)
      } else {
        setRows(enriched)
      }
    }
    fetchData()
const channel = supabase
  .channel(`bills-realtime-${mode}`)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => fetchData())
  .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchData())
  .subscribe()

return () => { supabase.removeChannel(channel) }
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
  const tablePct = o.discount_percent ?? 0
  const globalPct = settings.global_discount_percent ?? 0
  const effectivePct = tablePct > 0 ? tablePct : globalPct
  return (
          <Card key={o.id} className="p-4 flex flex-col justify-between min-h-[180px]">
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-bold flex flex-wrap items-center gap-1.5 leading-tight">
                    <span className="text-sm md:text-base text-foreground">{o._displayName}</span>
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
                  o.order_items.reduce((acc: any, it: any) => {
                    const key = `${it.name_snapshot}__${it.price_snapshot}`
                    if (acc[key]) {
                      acc[key].quantity += Number(it.quantity)
                    } else {
                      acc[key] = { ...it, quantity: Number(it.quantity) }
                    }
                    return acc
                  }, {})
                ).map((it: any) => (
                  <div key={it._key ?? it.name_snapshot} className="flex justify-between items-center gap-2 py-0.5 border-b border-dashed border-muted last:border-0">
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
                {(settings.service_percent > 0 || settings.vat_percent > 0 || (o.discount_percent ?? 0) > 0) && (
                  <div className="flex justify-between text-[10px] text-muted-foreground px-0.5">
                    <span>Tạm tính: {formatVND(
  o.order_items.reduce((sum: number, it: any) =>
    sum + Number(it.price_snapshot) * Number(it.quantity), 0)
)}</span>
                    <span>
                      {effectivePct > 0 && `Giảm: ${effectivePct}% `}
                      {settings.service_percent > 0 && `• Phí DV: ${settings.service_percent}% `}
                      {settings.vat_percent > 0 && `• VAT: ${settings.vat_percent}%`}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-sm font-bold text-primary">
                    <span className="text-xs font-normal text-muted-foreground mr-1">Tổng thanh toán:</span>
                    {(() => {
                      const subtotal = o.order_items.reduce((sum: number, it: any) =>
                        sum + Number(it.price_snapshot) * Number(it.quantity), 0)
                      const svcMoney = Math.round(subtotal * (settings.service_percent / 100))
                      const afterService = subtotal + svcMoney
                      const vatMoney = Math.round(afterService * (settings.vat_percent / 100))
                      const afterVAT = afterService + vatMoney
                      const tablePct = o.discount_percent ?? 0
                      const globalPct = settings.global_discount_percent ?? 0
                      const effectivePct = tablePct > 0 ? tablePct : globalPct
                      const discountMoney = Math.round(afterVAT * (effectivePct / 100))
                      return formatVND(afterVAT - discountMoney)
                    })()}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => printBill(o.id, { overridePaymentMethod: o.payment_method })}
                  >
                    <Receipt className="mr-1 h-3 w-3" />In
                  </Button>
                </div>
              </div>

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