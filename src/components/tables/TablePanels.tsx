import { MotionValue } from '@/components/MotionValue'
import { discountQuotePreview } from '@/lib/invoiceAmounts'
import { useOrderSync } from '@/hooks/useOrderSync'
import type { Tables } from '@/integrations/supabase/types'
import type { BillItem,Order } from '@/lib/domainTypes'
import { readOpenOrder } from '@/lib/openOrder'
import { adjustOrder,changeItem,payOrder,quoteOrder,readableError,submitOrder,type PaymentQuote } from '@/lib/restaurantTransactions'
// TypeScript / React - FULL COMPONENT WITH OPTIMIZED SERVED PANEL UI
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DialogHeader,DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/contexts/authState'
import { MenuItem,useMenu } from '@/hooks/useMenu'
import { RestaurantTable } from '@/hooks/useTables'
import { supabase } from '@/integrations/supabase/client'
import { formatVND } from '@/lib/formatVND'
import { decimalInput,optionalText } from '@/lib/inputValidation'
import { printBill } from '@/lib/printBill'
import {
CheckCircle2,
ChefHat,
ChevronDown,
ChevronUp,
ImageOff,
Minus,
Percent,
Plus,
Receipt,
RotateCcw,
Search,
Trash2
} from 'lucide-react'
import { useEffect,useMemo,useRef,useState } from 'react'
import { toast } from '@/lib/notifications'

function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
}
function fuzzyScore(name: string, q: string) {
  if (!q) return 1
  const n = normalize(name), nq = normalize(q)
  if (n.includes(nq)) return 200 - n.indexOf(nq)
  let i = 0
  for (const ch of n) { if (ch === nq[i]) i++; if (i === nq.length) break }
  return i === nq.length ? 50 - (n.length - nq.length) : 0
}

interface CartLine { item: MenuItem; qty: number; notes?: string }

interface ReturnItem {
  orderItemId: string
  itemName: string
  originalQty: number
  returnQty: number
}

interface GroupedOrderItem {
  name: string
  price: number
  totalQuantity: number
  totalReturned: number
  notes: string[]
  status: string
  rawItems: BillItem[]
}
//ORDER PANEL
export function OrderPanel({ table, onDone }: { table: RestaurantTable; onDone: () => void }) {
  const { items, categories } = useMenu()
  const [cat, setCat] = useState<string | 'all'>('all')
  const [query, setQuery] = useState('')
  const [showSuggest, setShowSuggest] = useState(false)
  const [cart, setCart] = useState<CartLine[]>(() => {
    const raw = sessionStorage.getItem(`cart-${table.id}`)
    if (raw) try { return JSON.parse(raw) } catch { /* Invalid cached cart is discarded. */ }
    return []
  })
  const [notes, setNotes] = useState('')
  const [isCartExpanded, setIsCartExpanded] = useState(true)
  const [isSending, setIsSending] = useState(false)

  const defaultsApplied = useRef(false)
  useEffect(() => {
  if (!defaultsApplied.current && cart.length === 0 && table.status === 'empty' && !table.merged_group_id) {
    const defaults = items.filter(i => i.is_default && i.is_available)
    if (defaults.length) { defaultsApplied.current = true; setCart(defaults.map(it => ({ item: it, qty: 1 }))) }
  }
}, [items,cart.length,table.status,table.merged_group_id])

  useEffect(() => { sessionStorage.setItem(`cart-${table.id}`, JSON.stringify(cart)) }, [cart, table.id])

  const filtered = useMemo(() => {
    const base = items.filter(i => i.is_available && (cat === 'all' || i.category_id === cat))
    if (!query.trim()) return base
    return base
      .map(i => ({ i, s: fuzzyScore(i.name, query.trim()) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map(x => x.i)
  }, [items, cat, query])

  const suggestions = useMemo(() => {
    const q = query.trim()
    if (!q) return []
    return items
      .filter(i => i.is_available)
      .map(i => ({ i, s: fuzzyScore(i.name, q) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 5)
      .map(x => x.i)
  }, [items, query])
  const total = cart.reduce((s, l) => s + l.item.price * l.qty, 0)

  const addItem = (item: MenuItem) => {
    setCart(c => {
      const i = c.findIndex(l => l.item.id === item.id)
      if (i >= 0) { const cp = [...c]; cp[i] = { ...cp[i], qty: cp[i].qty + 1 }; return cp }
      return [...c, { item, qty: 1 }]
    })
  }
  const inc = (id: string, d: number) =>
    setCart(c => c.map(l => l.item.id === id ? { ...l, qty: Math.max(0, l.qty + d) } : l).filter(l => l.qty > 0))

  const send = async () => {
    if (cart.length === 0 || isSending) return
    setIsSending(true)
    try {
      const lines = cart.map(l => ({ menu_item_id: l.item.id, quantity: decimalInput(l.qty, 'Số lượng món', 0, 1000, true), notes: optionalText(l.notes, 'Ghi chú món') || null }))
      const cleanNotes = optionalText(notes, 'Ghi chú đơn')
      const payload = JSON.stringify({ lines, notes: cleanNotes })
      const key = `order-request-${table.id}`
      let request: { payload: string; id: string } | null = null
      try { request = JSON.parse(sessionStorage.getItem(key) ?? 'null') } catch { /* discard invalid local request cache */ }
      if (request?.payload !== payload) request = { payload, id: crypto.randomUUID() }
      sessionStorage.setItem(key, JSON.stringify(request))
      await submitOrder(table.id, lines, cleanNotes, request.id)
      sessionStorage.removeItem(key)
      sessionStorage.removeItem(`cart-${table.id}`)
      toast.success('Đã gửi bếp')
      onDone()
    } catch (error: unknown) {
      toast.error(readableError(error))
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="flex h-[80vh] flex-col">
      <DialogHeader className="border-b p-4">
        <DialogTitle>Order — {table.name}</DialogTitle>
      </DialogHeader>
      <div className="border-b p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setShowSuggest(true) }}
            onFocus={() => setShowSuggest(true)}
            onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
            placeholder="Tìm món..."
            className="pl-9"
          />
          {showSuggest && suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border bg-popover shadow-lg">
              {suggestions.map(it => (
                <button
                  key={it.id}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { addItem(it); setQuery(''); setShowSuggest(false) }}
                  className="flex w-full items-center gap-2 border-b p-2 text-left last:border-0 hover:bg-accent"
                >
                  {it.image_url ? (
                    <img src={it.image_url} alt={it.name} className="h-10 w-10 rounded-md object-cover" />
                  ) : (
                    <div className="grid h-10 w-10 place-items-center rounded-md bg-muted"><ImageOff className="h-4 w-4 text-muted-foreground" /></div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{it.name}</div>
                    <div className="text-xs text-primary font-bold">{formatVND(it.price)}</div>
                  </div>
                  <Plus className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto border-b p-2">
        <Button size="sm" variant={cat === 'all' ? 'default' : 'outline'} onClick={() => setCat('all')}>Tất cả</Button>
        {categories.map(c => (
          <Button key={c.id} size="sm" variant={cat === c.id ? 'default' : 'outline'} onClick={() => setCat(c.id)}>{c.name}</Button>
        ))}
      </div>

      <ScrollArea className="flex-1">
        <div className="grid grid-cols-2 gap-2 p-3">
          {filtered.map(it => (
            <button key={it.id} data-motion-id={`order-menu-${it.id}`} onClick={() => addItem(it)} className="flex flex-col overflow-hidden rounded-xl border bg-card text-left shadow-card active:scale-95 transition">
              {it.image_url ? (
                <img src={it.image_url} alt={it.name} className="aspect-square w-full object-cover" />
              ) : (
                <div className="grid aspect-square w-full place-items-center bg-muted"><ImageOff className="h-8 w-8 text-muted-foreground" /></div>
              )}
              <div className="p-2">
                <div className="text-sm font-semibold leading-tight line-clamp-2">{it.name}</div>
                <div className="mt-1 text-xs text-primary font-bold">{formatVND(it.price)}</div>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-2 py-8 text-center text-sm text-muted-foreground">Không tìm thấy món phù hợp</div>
          )}
        </div>
      </ScrollArea>

      {/* KHỐI GIỎ HÀNG */}
      {cart.length > 0 && (
        <div className="border-t bg-muted/50 transition-all duration-200">
          <button
            type="button"
            onClick={() => setIsCartExpanded(!isCartExpanded)}
            className="flex w-full items-center justify-between px-3 py-2 bg-accent/60 hover:bg-accent border-b text-xs font-medium text-muted-foreground transition-colors"
          >
            <span className="font-semibold text-foreground">Món đã chọn ({cart.reduce((sum, l) => sum + l.qty, 0)})</span>
            <div className="flex items-center gap-1 text-primary">
              <span className="text-[11px]">{isCartExpanded ? "Thu gọn" : "Xem chi tiết"}</span>
              {isCartExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </div>
          </button>

          {isCartExpanded && (
            <div className="p-3">
              <ScrollArea className="h-36 pr-1 border rounded-lg bg-card p-2">
                <div className="space-y-2">
                  {cart.map(l => (
                    <div key={l.item.id} className="flex items-center gap-2 text-sm border-b border-muted/40 pb-1.5 last:border-0 last:pb-0">
                      <span className="flex-1 truncate font-medium">{l.item.name}</span>
                      <Button size="icon" variant="outline" className="h-7 w-7 shrink-0" onClick={() => inc(l.item.id, -1)}><Minus className="h-3 w-3" /></Button>
                      <span className="w-6 text-center font-bold tabular-nums shrink-0">{l.qty}</span>
                      <Button size="icon" variant="outline" className="h-7 w-7 shrink-0" onClick={() => inc(l.item.id, 1)}><Plus className="h-3 w-3" /></Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <Textarea className="mt-2 bg-card" placeholder="Ghi chú (vd: ít cay, không hành...)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          )}

          <div className="p-3 border-t bg-card flex items-center justify-between">
            <div className="text-sm">Tổng: <span className="font-bold text-primary text-base">{formatVND(total)}</span></div>
            <Button onClick={send} disabled={cart.length === 0 || isSending}><ChefHat className="mr-2 h-4 w-4" />Gửi bếp</Button>
          </div>
        </div>
      )}
    </div>
  )
}
//SERVED PANEL//
export function ServedPanel({ table, onBack }: { table: RestaurantTable; onBack: () => void }) {
  const [waiting, setWaiting] = useState<BillItem[]>([])  // pending - Chờ làm
  const [cooking, setCooking] = useState<BillItem[]>([])  // cooking - Đang làm
  const [done, setDone] = useState<BillItem[]>([])        // done - Chờ bê
  const [served, setServed] = useState<BillItem[]>([])    // served - Đã phục vụ

  const load = async (canCommit = () => true) => {
    const order = await readOpenOrder(table)
    if (!canCommit()) return
    const rawItems = order?.order_items ?? []

    setWaiting(rawItems.filter(x => x.status === 'pending'))
    setCooking(rawItems.filter(x => x.status === 'cooking'))
    setDone(rawItems.filter(x => x.status === 'done'))
    setServed(rawItems.filter(x => x.status === 'served'))
  }

  useOrderSync(load, `${table.id}:${table.merged_group_id ?? ''}`)

  const markServed = async (id: string) => {
    try { await changeItem(id, 'serve'); toast.success('Đã xác nhận bê món ra bàn') } catch (error: unknown) { toast.error(readableError(error)); await load() }
  }

  const cancelItem = async (id: string) => {
    try { await changeItem(id, 'cancel'); toast.success('Đã hủy món thành công') }
    catch (error: unknown) { toast.error(readableError(error)); await load() }
  }

  return (
    <div className="flex h-[80vh] flex-col">
      <DialogHeader className="border-b p-4">
        <DialogTitle>Trạng thái món — {table.name}</DialogTitle>
      </DialogHeader>

      <ScrollArea className="flex-1 p-3">
        <div className="space-y-4">
          {/* 1. BẾP CHƯA LÀM (CHỮ XÁM - TÊN ĐEN - NÚT ĐỎ CHỮ TRẮNG VIỀN ĐỎ) */}
          <div>
            {/* THAY ĐỔI: Chuyển màu tiêu đề trạng thái sang màu xám không màu mè */}
            <div className="mb-1 text-xs font-bold uppercase text-gray-500 tracking-wide">Bếp chưa làm ({waiting.length})</div>
            {waiting.length === 0 && <p className="text-xs text-muted-foreground/70 pl-2">— Không có món chờ</p>}
            <div className="space-y-1.5">
              {waiting.map(it => (
                <Card key={it.id} className="flex items-center justify-between p-3 border-muted bg-card">
                  <div>
                    {/* THAY ĐỔI: Chuyển tên món sang màu đen */}
                    <div className="font-bold text-black text-sm">{it.name_snapshot} × {it.quantity}</div>
                    {it.notes && <div className="text-xs text-muted-foreground italic">"{it.notes}"</div>}
                  </div>
                  {/* THAY ĐỔI: Sửa nút Hủy món thành chữ trắng, nền đỏ, viền đỏ */}
                  <Button
                    size="sm"
                    className="h-8 bg-red-600 text-white border border-red-600 hover:bg-red-700 font-medium"
                    onClick={() => cancelItem(it.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Hủy món
                  </Button>
                </Card>
              ))}
            </div>
          </div>

          {/* 2. BẾP ĐANG LÀM (CHỮ XÁM - TÊN ĐEN) */}
          <div>
            {/* THAY ĐỔI: Chuyển màu tiêu đề trạng thái sang màu xám */}
            <div className="mb-1 text-xs font-bold uppercase text-gray-500 tracking-wide">Bếp đang làm ({cooking.length})</div>
            {cooking.length === 0 && <p className="text-xs text-muted-foreground/70 pl-2">— Không có món đang nấu</p>}
            <div className="space-y-1.5">
              {cooking.map(it => (
                <Card key={it.id} className="flex items-center justify-between p-3 border-muted bg-card">
                  <div>
                    {/* THAY ĐỔI: Chuyển tên món sang màu đen */}
                    <div className="font-bold text-black text-sm">{it.name_snapshot} × {it.quantity}</div>
                    {it.notes && <div className="text-xs text-muted-foreground italic">"{it.notes}"</div>}
                  </div>
                  <span className="text-xs font-medium text-gray-500 bg-muted px-2 py-1 rounded border border-gray-200">
                    Đang chế biến
                  </span>
                </Card>
              ))}
            </div>
          </div>

          {/* 3. ĐÃ XONG CHỜ BÊ (CHỮ XÁM - TÊN ĐEN - NÚT ĐỎ CHỮ TRẮNG VIỀN ĐỎ) */}
          <div>
            {/* THAY ĐỔI: Chuyển màu tiêu đề trạng thái sang màu xám */}
            <div className="mb-1 text-xs font-bold uppercase text-gray-500 tracking-wide">Đã xong, chờ bê ({done.length})</div>
            {done.length === 0 && <p className="text-xs text-muted-foreground/70 pl-2">— Không có món chờ phục vụ</p>}
            <div className="space-y-1.5">
              {done.map(it => (
                <Card key={it.id} className="flex items-center justify-between p-3 border-muted bg-card">
                  <div>
                    {/* THAY ĐỔI: Chuyển tên món sang màu đen */}
                    <div className="font-bold text-black text-sm">{it.name_snapshot} × {it.quantity}</div>
                    {it.notes && <div className="text-xs text-muted-foreground italic">"{it.notes}"</div>}
                  </div>
                  {/* THAY ĐỔI: Sửa nút Bê ra thành chữ trắng, nền đỏ, viền đỏ tương tự nút hủy */}
                  <Button
                    size="sm"
                    className="h-8 bg-red-600 text-white border border-red-600 hover:bg-red-700 font-medium"
                    onClick={() => markServed(it.id)}
                  >
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Bê ra
                  </Button>
                </Card>
              ))}
            </div>
          </div>

          {/* 4. ĐÃ PHỤC VỤ (CHỮ XÁM - TÊN ĐEN) */}
          <div>
            {/* THAY ĐỔI: Chuyển màu tiêu đề trạng thái sang màu xám */}
            <div className="mb-1 text-xs font-bold uppercase text-gray-500 tracking-wide">Đã phục vụ ({served.length})</div>
            {served.length === 0 && <p className="text-xs text-muted-foreground/70 pl-2">— Chưa có món nào lên bàn</p>}
            <div className="space-y-1.5">
              {served.map(it => (
                <Card key={it.id} className="p-3 border-muted bg-card opacity-85">
                  {/* THAY ĐỔI: Chuyển tên món sang màu đen */}
                  <div className="font-bold text-black text-sm">{it.name_snapshot} × {it.quantity}</div>
                  {it.notes && <div className="text-xs text-muted-foreground italic">"{it.notes}"</div>}
                </Card>
              ))}
            </div>
          </div>

        </div>
      </ScrollArea>
      <div className="border-t p-3 bg-background"><Button variant="outline" className="w-full" onClick={onBack}>Đóng</Button></div>
    </div>
  )
}

// PAY PANEL (FULLY SEPARATED)//
export function PayPanel({ table, onDone }: { table: RestaurantTable; onBack: () => void; onDone: () => void }) {
  const { user } = useAuth()
  const [order, setOrder] = useState<Order | null>(null)
  const [quote, setQuote] = useState<PaymentQuote | null>(null)
  const [isPaying, setIsPaying] = useState(false)
  const [pay, setPay] = useState<Pick<Tables<'payment_settings'>,'qr_image_url'|'bank_name'|'account_holder'|'account_number'>>({ qr_image_url: null, bank_name: '', account_holder: '', account_number: '' })
  const [method, setMethod] = useState<'cash' | 'qr'>('qr')
  const initializedPaymentOrder = useRef<string | null>(null)
  const [settings, setSettings] = useState({ vat_percent: 0, service_percent: 0, global_discount_percent: 0 })
  const [subView, setSubView] = useState<'invoice' | 'return' | 'discount'>('invoice')

  const [returnItems, setReturnItems] = useState<Map<string, ReturnItem>>(new Map())
  const [returnReason, setReturnReason] = useState<string>('Khách không sử dụng')
  const [customReturnReason, setCustomReturnReason] = useState<string>('')

  const [discountRaw, setDiscountPercent] = useState<number | string>(0)
  const discountInput = useMemo(() => {
    try { return { percent: decimalInput(discountRaw, 'Giảm giá', 6, 100), error: null } }
    catch (error) { return { percent: null, error: readableError(error) } }
  }, [discountRaw])
  const discountPercent = discountInput.percent
  const [isApplyingDiscount, setIsApplyingDiscount] = useState(false)
  const discountInFlight = useRef(false)
  const [appliedDiscountPercent, setAppliedDiscountPercent] = useState<number>(0)  // ← thêm
  const [customDiscountReason, setCustomDiscountReason] = useState<string>('')
  const [discountReason, setDiscountReason] = useState<string>('Ưu đãi khuyến mãi')
  const loadOrderAndSettings = async (canCommit = () => true) => {
    const o = await readOpenOrder(table)
    const freshQuote = o ? await quoteOrder(o.id) : null
    if (!canCommit()) return
    if (o) {
      // Keep an unsaved payment-method choice while realtime refreshes items.
      if (initializedPaymentOrder.current !== o.id) {
        setMethod(o.payment_method ?? 'qr')
        initializedPaymentOrder.current = o.id
      }

      setAppliedDiscountPercent(freshQuote?.table_discount_percent ?? o.discount_percent ?? 0)
    }

    // Phần lấy cấu hình payment_settings giữ nguyên
    const { data: ps, error: settingsError } = await supabase
      .from('payment_settings')
      .select('qr_image_url, bank_name, account_holder, account_number, vat_percent, service_percent,global_discount_percent')
      .eq('id', 1)
      .maybeSingle()

    if (settingsError) throw settingsError
    if (!canCommit()) return
    setOrder(o && freshQuote ? { ...o, order_items: freshQuote.items } : null)
    setQuote(freshQuote)
    if (ps) {
      setPay(ps)
      setSettings({
        vat_percent: freshQuote?.vat_percent ?? ps.vat_percent ?? 0,
        service_percent: freshQuote?.service_percent ?? ps.service_percent ?? 0, global_discount_percent: ps.global_discount_percent ?? 0
      })
    }
  }
  useOrderSync(async (canCommit) => {
    try {
      await loadOrderAndSettings(canCommit)
    } catch (error: unknown) {
      if (!canCommit()) return
      setOrder(null)
      setQuote(null)
      toast.error(error instanceof Error ? error.message : 'Không thể tải hóa đơn.')
    }
  }, `${table.id}:${table.merged_group_id ?? ''}`)

  const groupedOrderItems = useMemo<GroupedOrderItem[]>(() => {
    if (!order?.order_items) return []

    const groups: { [key: string]: GroupedOrderItem } = {}
    const statusRank: Record<string, number> = { served: 4, done: 3, cooking: 2, pending: 1 }

    order.order_items.forEach((it) => {
      const key = `${it.menu_item_id}_${it.name_snapshot}_${it.price_snapshot}_${!!it.no_cook}`
      const itStatus = it.status || 'pending'
      const isReturned = returnItems.has(it.id)

      if (!groups[key]) {
        groups[key] = {
          name: it.name_snapshot,
          price: it.price_snapshot,
          totalQuantity: it.quantity,        // mỗi row = 1
          totalReturned: isReturned ? 1 : 0,
          notes: it.notes ? [it.notes] : [],
          status: itStatus,
          rawItems: [it]
        }
      } else {
        groups[key].totalQuantity += it.quantity
        groups[key].totalReturned += isReturned ? 1 : 0
        if (it.notes && !groups[key].notes.includes(it.notes))
          groups[key].notes.push(it.notes)
        groups[key].rawItems.push(it)
        // Badge hiển thị status cao nhất trong nhóm
        if ((statusRank[itStatus] ?? 0) > (statusRank[groups[key].status] ?? 0))
          groups[key].status = itStatus
      }
    })

    return Object.values(groups)
  }, [order?.order_items, returnItems])

  const subtotal = useMemo(() => {
    if (!order?.order_items) return 0
    return order.order_items.reduce((sum: number, it: BillItem) => {
      const returnItem = returnItems.get(it.id)
      const activeQty = returnItem ? (it.quantity - returnItem.returnQty) : it.quantity
      return sum + (it.price_snapshot * Math.max(0, activeQty))
    }, 0)
  }, [order?.order_items, returnItems])
  // Sửa lại 3 useMemo này
  const serviceFee = quote?.service_fee ?? 0
  const vat = quote?.vat_fee ?? 0
  const effectiveDiscountPct = quote?.discount_percent ?? 0
  const discountAmount = quote?.discount_amount ?? 0
  const finalTotal = quote?.total ?? 0

  const handleDecreaseReturnQty = (group: GroupedOrderItem) => {
    const newMap = new Map(returnItems)
    const currentTotalSelectedToReturn = group.rawItems.reduce((sum, it) => sum + (returnItems.get(it.id)?.returnQty ?? 0), 0)

    if (currentTotalSelectedToReturn <= 1) {
      group.rawItems.forEach((it) => newMap.delete(it.id))
      setReturnItems(newMap)
      return
    }

    let amountToDecrease = 1
    for (let i = group.rawItems.length - 1; i >= 0; i--) {
      const it = group.rawItems[i]
      const currentReturn = returnItems.get(it.id)
      if (currentReturn && currentReturn.returnQty > 0) {
        const decrease = Math.min(amountToDecrease, currentReturn.returnQty)
        const nextQty = currentReturn.returnQty - decrease
        if (nextQty === 0) {
          newMap.set(it.id, { ...currentReturn, returnQty: 0 })
        } else {
          newMap.set(it.id, { ...currentReturn, returnQty: nextQty })
        }
        amountToDecrease -= decrease
        if (amountToDecrease <= 0) break
      }
    }
    setReturnItems(newMap)
  }
  const handleConfirmReturns = async () => {
    if (!order || returnItems.size === 0) return
    try {
      const finalReturnReason = optionalText(returnReason === 'Khác' ? (customReturnReason.trim() || 'Không ghi rõ') : returnReason, 'Lý do trả món')

      await adjustOrder(order.id, 'return', Array.from(returnItems.values()).filter(it => it.returnQty > 0).map(it => ({
        id: it.orderItemId, quantity: it.returnQty, expected_quantity: it.originalQty,
      })), finalReturnReason)

      toast.success('Đã xác nhận trả món')
      setReturnItems(new Map())
      setReturnReason('Khách không sử dụng')
      setCustomReturnReason('')
      setSubView('invoice')
      await loadOrderAndSettings()
    } catch (err: unknown) {
      toast.error('❌ Lỗi: ' + readableError(err))
    }
  }

  const buildDiscountReason = (): string => discountReason === 'Khác' ? (customDiscountReason.trim() || 'Không ghi rõ') : discountReason

  const handleConfirmDiscount = async () => {
    if (!order || !quote || discountPercent === null || discountInFlight.current) return
    discountInFlight.current = true
    setIsApplyingDiscount(true)
    try {
      const percent = decimalInput(discountRaw, 'Giảm giá', 6, 100)
      if (percent > 0 && quote.subtotal <= 0) throw new Error('Hóa đơn 0 ₫ chỉ có thể áp dụng giảm giá 0%.')
      const finalDiscountReason = optionalText(buildDiscountReason(), 'Lý do giảm giá')
      await adjustOrder(order.id, 'discount', { percent }, finalDiscountReason)
      toast.success(percent === 0 ? 'Đã cập nhật giảm giá riêng của bàn về 0%' : 'Đã áp dụng giảm giá')
      setAppliedDiscountPercent(percent)
      setDiscountPercent(0)
      setDiscountReason('Ưu đãi khuyến mãi')
      setCustomDiscountReason('')
      setSubView('invoice')
      await loadOrderAndSettings()
    } catch (err: unknown) {
      toast.error('❌ Lỗi: ' + readableError(err))
    } finally {
      discountInFlight.current = false
      setIsApplyingDiscount(false)
    }
  }

  const performPayment = async (action: 'request_qr' | 'confirm_cash') => {
    if (!order || !quote || isPaying) return
    setIsPaying(true)
    try {
      await payOrder(order.id, action, quote.fingerprint)
      toast.success(action === 'confirm_cash' ? 'Đã nhận tiền → Bàn chờ dọn' : 'Chuyển sang chờ thanh toán', { description: `${formatVND(quote.total)} • ${action === 'confirm_cash' ? 'Tiền mặt' : 'QR — đang chờ xác nhận'}` })
      onDone()
    } catch (error: unknown) {
      toast.error(readableError(error))
      try { await loadOrderAndSettings() } catch (refreshError: unknown) { setOrder(null); setQuote(null); toast.error(readableError(refreshError)) }
    } finally { setIsPaying(false) }
  }
  const requestPayment = () => performPayment('request_qr')
  const confirmCashReceived = () => performPayment('confirm_cash')
  if (subView === 'return') {
    const hasReturnItems = Array.from(returnItems.values()).some(item => item.returnQty > 0)
    const totalReturnAmount = Array.from(returnItems.values()).reduce((sum, item) => {
      const orderItem = order?.order_items?.find((it) => it.id === item.orderItemId)
      return sum + (orderItem?.price_snapshot ?? 0) * item.returnQty
    }, 0)

    return (
      <div className="flex h-[80vh] flex-col bg-gradient-to-b from-background via-red-50/30 to-background">
        <DialogHeader className="border-b p-4 bg-red-50/50">
          <DialogTitle className="text-red-700">🔙 Trả Món — {table.name}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 p-4 space-y-4">
          <div className="text-xs font-bold uppercase text-muted-foreground tracking-wide">DANH SÁCH MÓN CÓ THỂ TRẢ</div>
          <div className="space-y-2">
            {groupedOrderItems.filter(group =>
  group.rawItems.some(it => it.no_cook)
).map((group, idx) => {
              const groupReturnedQty = group.rawItems.reduce(
                (sum, it) => sum + (returnItems.get(it.id)?.returnQty ?? 0), 0
              )
              const maxQty = group.totalQuantity

              const handleIncrease = (e: React.MouseEvent) => {
                e.stopPropagation()
                if (groupReturnedQty >= maxQty) return
                const newMap = new Map(returnItems)
                // Tìm row chưa được mark trả, mark thêm 1
                for (const it of group.rawItems) {
                  const cur = newMap.get(it.id)
                  const curQty = cur?.returnQty ?? 0
                  if (curQty < it.quantity) {
                    newMap.set(it.id, {
                      orderItemId: it.id,
                      itemName: it.name_snapshot,
                      originalQty: it.quantity,
                      returnQty: curQty + 1,
                    })
                    break
                  }
                }
                setReturnItems(newMap)
              }

              const handleDecrease = (e: React.MouseEvent) => {
                e.stopPropagation()
                if (groupReturnedQty <= 0) return
                handleDecreaseReturnQty(group)
              }

              return (
                <Card key={idx} className="p-3 border-2 border-muted">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm flex items-center gap-1.5 flex-wrap">
                        <span>{group.name}</span>
                        {group.status === 'cooking' && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Bếp làm</span>}
                        {group.status === 'done' && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Chờ bê</span>}
                        {group.status === 'served' && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">Đã lên</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Gốc: {maxQty} × {formatVND(group.price)}
                      </div>
                    </div>

                    {/* Stepper tăng/giảm */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8"
                        disabled={groupReturnedQty <= 0}
                        onClick={handleDecrease}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <span className={`w-8 text-center font-black text-base tabular-nums ${groupReturnedQty > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                        {groupReturnedQty}
                      </span>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8"
                        disabled={groupReturnedQty >= maxQty}
                        onClick={handleIncrease}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Tóm tắt tiền trả nếu > 0 */}
                  {groupReturnedQty > 0 && (
                    <div className="mt-2 pt-2 border-t border-red-200 flex justify-between text-xs">
                      <span className="text-red-600 font-semibold">Trả {groupReturnedQty} món</span>
                      <span className="text-red-600 font-bold">-{formatVND(group.price * groupReturnedQty)}</span>
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
          {hasReturnItems && (
            <div className="border-t pt-4 space-y-3">
              <div className="text-xs font-bold uppercase text-muted-foreground">Lý do trả:</div>
              <div className="grid grid-cols-2 gap-2">
                {['Khách không sử dụng', 'Nhập nhầm', 'Lỗi nhà bếp', 'Khác'].map((reason) => (
                  <Button key={reason} variant={returnReason === reason ? 'default' : 'outline'} size="sm" onClick={() => { setReturnReason(reason); if (reason !== 'Khác') setCustomReturnReason('') }}>{reason}</Button>
                ))}
              </div>
              {returnReason === 'Khác' && <Textarea placeholder="Nhập chi tiết..." value={customReturnReason} onChange={(e) => setCustomReturnReason(e.target.value)} className="text-xs text-xs" rows={2} />}
              <Card className="p-3 bg-red-50 border-red-200"><div className="text-xs font-semibold text-red-700">TỔNG TIỀN TRẢ VỀ:</div><div className="text-lg font-black text-red-700 mt-1">{formatVND(totalReturnAmount)}</div></Card>
            </div>
          )}
        </ScrollArea>
        <div className="grid grid-cols-2 gap-2 border-t p-3 bg-background"><Button variant="outline" onClick={() => { setSubView('invoice'); setReturnItems(new Map()); }}><RotateCcw className="mr-1 h-4 w-4" /> Quay lại</Button><Button onClick={handleConfirmReturns} disabled={!hasReturnItems} className="bg-red-600 hover:bg-red-700 font-bold"><CheckCircle2 className="mr-1 h-4 w-4" /> Xác nhận trả</Button></div>
      </div>
    )
  }

  if (subView === 'discount') {
    const preview = quote && discountPercent !== null ? discountQuotePreview(quote, discountPercent) : null
    return (
      <div className="flex h-[80vh] flex-col bg-gradient-to-b from-background via-amber-50/30 to-background">
        <DialogHeader className="border-b p-4 bg-amber-50/50"><DialogTitle data-motion-count className="text-amber-700">💰 Giảm Giá Bill — {table.name}</DialogTitle></DialogHeader>
        <ScrollArea className="flex-1 p-4 space-y-6">
          <Card className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200">
            <div className="text-xs text-muted-foreground font-semibold mb-1">TỔNG THANH TOÁN HIỆN TẠI:</div>
            <span data-motion-count data-testid="discount-current-total" className="font-black text-lg text-blue-700"><MotionValue value={finalTotal}>{formatVND(finalTotal)}</MotionValue></span>
          </Card>
          <div className="space-y-3">
            <label htmlFor="discount-percent" className="text-xs font-bold uppercase text-muted-foreground">Phần Trăm Giảm Giá:</label>
            <div className="relative"><Input id="discount-percent"
              type="text" inputMode="decimal" maxLength={32}
              value={discountRaw} placeholder="0–100"
              aria-invalid={discountInput.error !== null}
              aria-describedby={discountInput.error ? 'discount-percent-error' : undefined}
              onFocus={event => event.target.select()}
              onChange={event => setDiscountPercent(event.target.value)}
              className="text-center font-bold text-2xl pr-8"
            /><span className="absolute right-3 top-1/2 -translate-y-1/2 font-bold text-muted-foreground text-lg">%</span></div>
            {discountInput.error && <p id="discount-percent-error" role="alert" className="text-xs text-red-600">{discountInput.error}</p>}
            {quote && quote.subtotal <= 0 && <p className="text-xs text-muted-foreground">Hóa đơn 0 ₫ chỉ có thể áp dụng giảm giá 0%.</p>}
          </div>
          {preview && (
            <Card className="p-4 bg-blue-50 border-blue-300 space-y-2">
              <div className="flex justify-between items-baseline text-sm"><span className="text-muted-foreground font-semibold">Tiền Giảm ({preview.percent}%):</span><span className="font-bold text-base text-blue-700">-{formatVND(preview.discount)}</span></div>
              <div className="border-t border-blue-200 pt-2 flex justify-between items-baseline"><span className="text-muted-foreground font-semibold text-sm">Tổng Thanh Toán Sau Giảm:</span><span data-testid="discount-preview-total" className="font-black text-lg text-blue-700"><MotionValue value={preview.total}>{formatVND(preview.total)}</MotionValue></span></div>
              {discountPercent === 0 && preview.percent > 0 && <p className="text-xs text-muted-foreground">Giảm giá riêng của bàn là 0%; giảm giá chung {preview.percent}% của hệ thống vẫn áp dụng.</p>}
            </Card>
          )}
          <div className="space-y-3 border-t pt-4">
            <div className="text-xs font-bold uppercase text-muted-foreground">Lý Do Giảm Giá:</div>
            <div className="grid grid-cols-2 gap-2">
              {['Ưu đãi khuyến mãi', 'Khách VIP', 'Khiếu nại', 'Khác'].map((reason) => (
                <Button key={reason} variant={discountReason === reason ? 'default' : 'outline'} size="sm" className="text-xs justify-center font-semibold h-9" onClick={() => { setDiscountReason(reason); if (reason !== 'Khác') setCustomDiscountReason('') }}>{reason}</Button>
              ))}
            </div>
            {discountReason === 'Khác' && <Textarea placeholder="Nhập lý do..." value={customDiscountReason} onChange={(e) => setCustomDiscountReason(e.target.value)} className="text-xs" rows={2} />}
          </div>
        </ScrollArea>
        <div className="grid grid-cols-2 gap-2 border-t p-3 bg-background"><Button variant="outline" onClick={() => { setSubView('invoice'); setDiscountPercent(0); }}><RotateCcw className="mr-1 h-4 w-4" /> Quay lại</Button><Button busy={isApplyingDiscount} onClick={handleConfirmDiscount} disabled={!order || !quote || discountPercent === null || isApplyingDiscount || (discountPercent > 0 && quote.subtotal <= 0)} className="bg-amber-600 hover:bg-amber-700 font-bold"><Percent className="mr-1 h-4 w-4" /> Áp dụng</Button></div>
      </div>
    )
  }

  return (
    <div className="flex h-[80vh] flex-col">
      <DialogHeader className="border-b p-4 flex flex-row items-center justify-between">
        <DialogTitle data-motion-count>Hóa Đơn — {table.name}</DialogTitle>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" className="text-xs h-8 border-red-200 text-red-700 hover:bg-red-50 font-semibold" disabled={!order || !quote || isPaying} onClick={() => setSubView('return')}>🔙 Trả món</Button>
          <Button size="sm" variant="outline" className="text-xs h-8 border-amber-200 text-amber-700 hover:bg-amber-50 font-semibold" disabled={!order || !quote || isPaying} onClick={() => { setDiscountPercent(quote?.table_discount_percent ?? order?.discount_percent ?? 0); setSubView('discount') }}>💰 Giảm giá</Button>
        </div>
      </DialogHeader>
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-1.5 text-sm">
          {groupedOrderItems.map((group, idx) => {
            const displayQty = group.totalQuantity - group.totalReturned
            if (displayQty <= 0 && group.totalReturned > 0) return null

            const renderStatusBadge = (status: string) => {
              switch (status) {
                case 'cooking': return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Bếp làm</span>
                case 'done': return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Chờ bê</span>
                case 'served': return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">Đã lên</span>
                default: return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Chờ làm</span>
              }
            }

            return (
              <div key={idx} className="flex flex-col border-b border-muted/20 pb-1.5 last:border-0 last:pb-0">
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium flex items-center gap-1.5 flex-wrap">
                      <span>{group.name} × {displayQty}</span>
                      {renderStatusBadge(group.status)}
                      {group.totalReturned > 0 && <span className="text-[10px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded font-bold">Trả {group.totalReturned}</span>}
                    </div>
                    {group.notes.length > 0 && <div className="text-xs text-muted-foreground italic mt-0.5">"{group.notes.join(', ')}"</div>}
                  </div>
                  <span className="tabular-nums font-semibold shrink-0">{formatVND(group.price * displayQty)}</span>
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-4 space-y-1.5 border-t pt-3 text-sm">

          <div className="flex justify-between font-semibold">
            <span>Tạm tính:</span><span>{formatVND(subtotal)}</span>
          </div>
          {settings.service_percent > 0 && (
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Phí dịch vụ ({settings.service_percent}%):</span>
              <span>{formatVND(serviceFee)}</span>
            </div>
          )}
          {settings.vat_percent > 0 && (
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>VAT ({settings.vat_percent}%):</span>
              <span>{formatVND(vat)}</span>
            </div>
          )}
          {effectiveDiscountPct > 0 && (
            <div className="flex justify-between text-xs text-red-600 font-semibold">
              <span>
                Giảm giá ({effectiveDiscountPct}%)
                {appliedDiscountPercent === 0 && ' · toàn hệ thống'}
              </span>
              <span>-{formatVND(discountAmount)}</span>
            </div>
          )}
        </div>
        <div className="my-4 border-t pt-3"><div className="flex justify-between items-baseline"><span className="text-base font-bold">Tổng Thanh Toán:</span><span className="text-3xl font-black text-primary"><MotionValue value={finalTotal}>{formatVND(finalTotal)}</MotionValue></span></div></div>
        <div className="space-y-2 border-t pt-3">
          <div className="text-xs font-bold uppercase text-muted-foreground">Phương Thức Thanh Toán:</div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant={method === 'qr' ? 'default' : 'outline'} onClick={() => setMethod('qr')} size="sm" className="font-semibold">QR Chuyển khoản</Button>
            <Button variant={method === 'cash' ? 'default' : 'outline'} onClick={() => setMethod('cash')} size="sm" className="font-semibold">Tiền mặt</Button>
          </div>
        </div>
        {method === 'qr' && (
          <div className="mt-4 grid place-items-center space-y-3 border rounded-lg p-4 bg-muted/30">
            {pay.qr_image_url ? <img src={pay.qr_image_url} alt="QR" className="max-h-64 rounded-lg border" /> : <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Chưa cấu hình ảnh QR</div>}
            <p className="text-sm font-semibold">Số tiền: <span className="text-primary font-black"><MotionValue value={finalTotal}>{formatVND(finalTotal)}</MotionValue></span></p>
            {(pay.bank_name || pay.account_holder || pay.account_number) && (
              <div className="w-full max-w-sm space-y-1 rounded-lg border bg-muted/40 p-3 text-xs">
                {pay.bank_name && <div className="flex justify-between"><span className="text-muted-foreground">Ngân hàng:</span><span className="font-semibold">{pay.bank_name}</span></div>}
                {pay.account_holder && <div className="flex justify-between"><span className="text-muted-foreground">Chủ TK:</span><span className="font-semibold">{pay.account_holder}</span></div>}
                {pay.account_number && <div className="flex justify-between"><span className="text-muted-foreground">Số TK:</span><span className="font-semibold font-mono">{pay.account_number}</span></div>}
              </div>
            )}
          </div>
        )}
      </ScrollArea>
      <div className="grid grid-cols-2 gap-2 border-t p-3 bg-background shrink-0">
        <Button variant="outline" disabled={!order || !quote || isPaying} onClick={() => order && printBill(order.id, { overridePaymentMethod: method, currentUserId: user?.id })} size="sm" className="font-semibold"><Receipt className="mr-1 h-4 w-4" /> In bill</Button>
        {method === 'cash' ? (
          <Button disabled={!order || !quote || isPaying} busy={isPaying} onClick={confirmCashReceived} className="bg-emerald-600 hover:bg-emerald-700 font-bold" size="sm"><CheckCircle2 className="mr-1 h-4 w-4" /> Đã nhận tiền</Button>
        ) : (
          <Button disabled={!order || !quote || isPaying} busy={isPaying} onClick={requestPayment} className="bg-red-600 hover:bg-red-700 text-white font-bold" size="sm">Thanh toán</Button>
        )}
      </div>
    </div>
  )
}
