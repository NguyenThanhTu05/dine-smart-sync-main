// TypeScript / React
import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { CheckCircle2, ChefHat, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { vi } from 'date-fns/locale'

export default function KitchenPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [openItem, setOpenItem] = useState<any>(null)
  const [recipe, setRecipe] = useState<any[]>([])
  const [recipeText, setRecipeText] = useState<string>('')
  const [confirmItem, setConfirmItem] = useState<any>(null)
  
  // LỰA CHỌN TỐI ƯU: Lưu mốc thời gian bắt đầu nấu của các món locally để không bị lỗi DB 400
  const [cookingTimers, setCookingTimers] = useState<Record<string, number>>({})
  // Bộ kích hoạt re-render đồng hồ chạy theo từng giây (Thời gian thực)
  const [, setTick] = useState<number>(0)

  const load = async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, restaurant_tables(name, areas(name)), order_items(*)')
      .eq('is_paid', false)
      .order('created_at')

    const filtered = (data ?? [])
      .map(o => ({
        ...o,
        order_items: o.order_items.filter((i: any) => i.status === 'pending' || i.status === 'cooking')
      }))
      .filter(o => o.order_items.length > 0)
    setOrders(filtered)
  }

  useEffect(() => {
    load()
    const ch = supabase.channel(`kds-rt-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load)
      .subscribe()
      
    return () => { supabase.removeChannel(ch) }
  }, [])

  // SỬA: Chạy interval mỗi 1 giây để bộ đếm thời gian thực tự động nhảy số mượt mà
  useEffect(() => {
    const timer = setInterval(() => {
      setTick(prev => prev + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // SỬA CHUẨN: Loại bỏ hoàn toàn updated_at khỏi câu lệnh SQL để loại bỏ lỗi 400 kẹt nút
  const startCooking = async (id: string) => {
    // Lưu ngay mốc thời gian hiện tại vào State cục bộ trước khi đồng bộ lên Supabase
    setCookingTimers(prev => ({ ...prev, [id]: Date.now() }))

    const { error } = await supabase
      .from('order_items')
      .update({ status: 'cooking' }) // Chỉ cập nhật duy nhất status
      .eq('id', id)

    if (error) {
      toast.error(error.message)
    } else {
      load()
    }
  }

  const finish = async (id: string) => {
    const { error } = await supabase.from('order_items').update({ status: 'done' }).eq('id', id)
    if (error) {
      toast.error(error.message)
    } else {
      toast.success('Đã hoàn thành')
      // Xóa timer của món này ra khỏi bộ nhớ local sau khi làm xong
      setCookingTimers(prev => {
        const copy = { ...prev }
        delete copy[id]
        return copy
      })
    }
    setConfirmItem(null)
    load()
  }

  const handleFinishClick = (it: any) => {
    if (it.status === 'pending') setConfirmItem(it)
    else finish(it.id)
  }

  const openRecipe = async (it: any) => {
    setOpenItem(it)
    setRecipeText('')
    const { data: recipeData } = await supabase
      .from('recipes')
      .select('*, ingredients(name,unit)')
      .eq('menu_item_id', it.menu_item_id)
    setRecipe(recipeData ?? [])
    const { data: menuData } = await supabase
      .from('menu_items')
      .select('recipe')
      .eq('id', it.menu_item_id)
      .maybeSingle()
    if (menuData?.recipe) setRecipeText(menuData.recipe)
  }

  const renderItemRow = (it: any) => {
    // LOGIC TÍNH THỜI GIAN THỰC CHUẨN XÁC:
    // Nếu đang nấu -> Ưu tiên mốc thời gian bấm nút từ local state, nếu reload trang thì fallback về it.created_at
    // Nếu chưa nấu -> Tính từ lúc tạo món ăn (it.created_at)
    const timeMark = it.status === 'cooking' 
      ? (cookingTimers[it.id] ? new Date(cookingTimers[it.id]) : new Date(it.created_at)) 
      : new Date(it.created_at)

    return (
      <div key={it.id} className="rounded-lg border bg-background p-3 shadow-sm">
        <button onClick={() => openRecipe(it)} className="block w-full text-left">
          <div className="flex items-baseline justify-between">
            <span className="text-base font-bold text-foreground">{it.name_snapshot}</span>
            <span className="text-sm font-bold text-primary">×{it.quantity}</span>
          </div>
          {it.notes && <div className="mt-1 rounded bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">📝 {it.notes}</div>}
          
          <div className="mt-1 text-[10px] text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3 inline text-muted-foreground/70" />
            <span className="font-medium tabular-nums">
              {it.status === 'cooking' ? 'Đã nấu: ' : 'Chờ đợi: '}
              {formatDistanceToNow(timeMark, { locale: vi, addSuffix: false })}
            </span>
          </div>
        </button>
        <div className="mt-2 flex gap-2">
          {it.status === 'pending' && (
            <Button size="sm" variant="outline" className="flex-1 text-xs font-bold h-8" onClick={() => startCooking(it.id)}>
              Bắt đầu nấu
            </Button>
          )}
          {it.status === 'cooking' && (
            <Badge variant="secondary" className="flex-1 justify-center py-1 text-xs font-bold bg-amber-50 border-amber-200 text-amber-700 h-8 rounded-md">
              Đang nấu...
            </Badge>
          )}
          <Button size="sm" className="flex-1 text-xs font-bold h-8" onClick={() => handleFinishClick(it)}>
            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />Xong
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-foreground/5 p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between border-b pb-4">
        <h1 className="flex items-center gap-2 text-2xl md:text-3xl font-black">
          <ChefHat className="h-7 w-7 text-primary" />Khu chế biến
        </h1>
        <Badge className="text-sm md:text-base px-3 py-1">
          {orders.reduce((s, o) => s + o.order_items.length, 0)} món
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {orders.map(o => {
          const pendingItems = o.order_items.filter((i: any) => i.status === 'pending')
          const cookingItems = o.order_items.filter((i: any) => i.status === 'cooking')
          const areaName = o.restaurant_tables?.areas?.name

          return (
            <Card key={o.id} className="border-2 border-primary/20 bg-card p-4 shadow-soft flex flex-col justify-between h-fit">
              <div>
                <div className="mb-3 flex items-center justify-between border-b pb-2">
                  <div>
                    <h2 className="text-xl font-black leading-tight">{o.restaurant_tables?.name}</h2>
                    {areaName && (
                      <span className="text-xs font-medium text-muted-foreground">{areaName}</span>
                    )}
                  </div>
                  {/* Bộ đếm thời gian tổng thể của bàn chạy real-time */}
                  <Badge variant="outline" className="text-xs shrink-0 font-mono bg-background tabular-nums">
                    <Clock className="mr-1 h-3 w-3 text-destructive" />
                    {formatDistanceToNow(new Date(o.created_at), { locale: vi, addSuffix: false })}
                  </Badge>
                </div>

                <div className="space-y-4">
                  {pendingItems.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-destructive flex items-center gap-1.5 pl-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />
                        Chưa nấu ({pendingItems.length})
                      </div>
                      <div className="space-y-2">
                        {pendingItems.map(it => renderItemRow(it))}
                      </div>
                    </div>
                  )}

                  {pendingItems.length > 0 && cookingItems.length > 0 && (
                    <div className="border-t border-dashed my-2" />
                  )}

                  {cookingItems.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-amber-600 flex items-center gap-1.5 pl-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        Đang nấu ({cookingItems.length})
                      </div>
                      <div className="space-y-2">
                        {cookingItems.map(it => renderItemRow(it))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )
        })}

        {orders.length === 0 && (
          <p className="col-span-full rounded-lg border-2 border-dashed p-12 text-center text-muted-foreground bg-card">
            Chưa có món nào cần chế biến 🎉
          </p>
        )}
      </div>

      <Dialog open={!!confirmItem} onOpenChange={(o) => !o && setConfirmItem(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Xác nhận hoàn thành</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Món <span className="font-bold text-foreground">"{confirmItem?.name_snapshot}"</span> chưa được bắt đầu nấu. Bạn có chắc đã nấu xong chưa?
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmItem(null)}>Chưa nấu xong</Button>
            <Button onClick={() => finish(confirmItem?.id)}>
              <CheckCircle2 className="mr-1 h-4 w-4" />Xác nhận đã xong
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!openItem} onOpenChange={(o) => !o && setOpenItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Công thức — {openItem?.name_snapshot}</DialogTitle></DialogHeader>
          <div className="space-y-4 my-2">
            {recipeText ? (
              <div className="rounded-lg bg-primary/5 border border-primary/10 p-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-primary mb-1">Hướng dẫn chế biến:</h4>
                <p className="text-sm text-foreground font-medium whitespace-pre-line leading-relaxed">{recipeText}</p>
              </div>
            ) : !recipe.length ? (
              <p className="text-sm text-muted-foreground italic py-2">Chưa cấu hình nội dung công thức cho món ăn này.</p>
            ) : null}
            {recipe.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Định lượng nguyên liệu:</h4>
                <ul className="space-y-1 text-sm border rounded-lg p-3 bg-muted/30">
                  {recipe.map(r => (
                    <li key={r.id} className="flex justify-between border-b border-dashed border-muted last:border-0 py-1 last:pb-0 first:pt-0">
                      <span className="text-muted-foreground">{r.ingredients?.name}</span>
                      <span className="font-bold tabular-nums">{r.quantity} {r.ingredients?.unit}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}