import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useSearchParams } from 'react-router-dom'
import { useMenu } from '@/hooks/useMenu'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Trash2, Plus, PackagePlus } from 'lucide-react'
import { toast } from 'sonner'
import { formatVND } from '@/hooks/useGlobalCounts'
import { ImageUpload } from '@/components/ImageUpload'

interface Ing { id: string; name: string; unit: string; stock: number; min_stock: number }

// ─────────────────────────────────────────────
// TAB 1: NGUYÊN LIỆU
// ─────────────────────────────────────────────
function InventoryTab({ onRowsChange }: { onRowsChange?: (rows: Ing[]) => void }) {
  const [rows, setRows] = useState<Ing[]>([])
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState<Partial<Ing>>({ name: '', unit: 'g', stock: 0, min_stock: 0 })
  const [stockOpen, setStockOpen] = useState<Ing | null>(null)
  const [delta, setDelta] = useState(0)

  const load = async () => {
  const { data } = await supabase.from('ingredients').select('*').order('name')
  const result = (data ?? []) as Ing[]
  setRows(result)
  onRowsChange?.(result)  // ← thêm dòng này
}
  useEffect(() => { load() }, [])

  const save = async () => {
    if (!edit.name) return
    if (edit.id) await supabase.from('ingredients').update(edit).eq('id', edit.id)
    else await supabase.from('ingredients').insert(edit as any)
    setOpen(false); setEdit({ name: '', unit: 'g', stock: 0, min_stock: 0 }); load(); toast.success('Đã lưu')
  }
  const del = async (id: string) => {
    if (!confirm('Xóa nguyên liệu này?')) return
    await supabase.from('ingredients').delete().eq('id', id); load()
  }
  const addStock = async () => {
    if (!stockOpen || !delta) return
    await supabase.from('ingredients').update({ stock: Number(stockOpen.stock) + Number(delta) }).eq('id', stockOpen.id)
    await supabase.from('stock_movements').insert({ ingredient_id: stockOpen.id, delta, reason: 'Nhập kho' })
    setStockOpen(null); setDelta(0); load(); toast.success('Đã nhập kho')
    window.dispatchEvent(new Event('table-status-changed-local'))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{rows.length} nguyên liệu</span>
        <Button onClick={() => { setEdit({ name: '', unit: 'g', stock: 0, min_stock: 0 }); setOpen(true) }}><Plus className="mr-1 h-4 w-4"/>Thêm</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map(r => (
          <Card key={r.id} className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-bold">{r.name}</div>
                <div className="text-sm">Tồn: <span className={`font-bold ${r.stock <= 0 ? 'text-destructive' : ''}`}>{r.stock} {r.unit}</span></div>
              </div>
              {r.stock <= 0 && <Badge variant="destructive">Hết</Badge>}
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setStockOpen(r)}><PackagePlus className="mr-1 h-3 w-3"/>Nhập</Button>
              <Button size="sm" variant="outline" onClick={() => { setEdit(r); setOpen(true) }}>Sửa</Button>
              <Button size="sm" variant="ghost" onClick={() => del(r.id)}><Trash2 className="h-3 w-3 text-destructive"/></Button>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit.id ? 'Sửa' : 'Thêm'} nguyên liệu</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Tên</Label><Input value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })}/></div>
            <div className="grid grid-cols-3 gap-2">
              <div><Label>Đơn vị</Label><Input value={edit.unit ?? 'g'} onChange={(e) => setEdit({ ...edit, unit: e.target.value })}/></div>
              <div><Label>Tồn</Label><Input type="number" value={edit.stock || ''} placeholder="0" onChange={(e) => setEdit({ ...edit, stock: Number(e.target.value) })}/></div>
              <div><Label>Min</Label><Input type="number" value={edit.min_stock || ''} placeholder="0" onChange={(e) => setEdit({ ...edit, min_stock: Number(e.target.value) })}/></div>
            </div>
          </div>
          <DialogFooter><Button onClick={save}>Lưu</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!stockOpen} onOpenChange={(o) => !o && setStockOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nhập kho — {stockOpen?.name}</DialogTitle></DialogHeader>
          <div><Label>Số lượng nhập ({stockOpen?.unit})</Label><Input type="number" value={delta || ''} placeholder="0" onChange={(e) => setDelta(Number(e.target.value))}/></div>
          <DialogFooter><Button onClick={addStock}>Xác nhận</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─────────────────────────────────────────────
// TAB 2: MENU
// ─────────────────────────────────────────────
function MenuTab() {
  const { items, categories, reload } = useMenu()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<any>({ name: '', price: '', category_id: null, is_available: true, is_default: false, no_cook: false, image_url: '', recipe: '' })
  const [catOpen, setCatOpen] = useState(false)
  const [catName, setCatName] = useState('')

  const save = async () => {
    if (!form.name.trim() || form.price === '') return toast.error('Vui lòng nhập đầy đủ Tên và Giá!')
    const payload = { ...form, price: Number(form.price), image_url: form.image_url || null }
    try {
      let error
      if (form.id) { const { error: err } = await supabase.from('menu_items').update(payload).eq('id', form.id); error = err }
      else { const { error: err } = await supabase.from('menu_items').insert(payload); error = err }
      if (error) return toast.error(error.message)
      setOpen(false)
      setForm({ name: '', price: '', category_id: categories[0]?.id ?? null, is_available: true, is_default: false, no_cook: false, image_url: '', recipe: '' })
      reload(); toast.success('Đã lưu')
    } catch (err: any) { toast.error(err.message) }
  }

  const del = async (id: string) => {
    if (!confirm('Xóa món này?')) return
    await supabase.from('menu_items').delete().eq('id', id); reload(); toast.success('Đã xóa')
  }
  const addCat = async () => {
    if (!catName.trim()) return
    const { error } = await supabase.from('categories').insert({ name: catName.trim(), sort_order: categories.length + 1 })
    if (error) return toast.error(error.message)
    setCatName(''); reload(); toast.success('Đã thêm danh mục')
  }
  const delCat = async (id: string, name: string) => {
    if (items.some(it => it.category_id === id)) return toast.error(`Danh mục "${name}" vẫn còn món ăn.`)
    if (!confirm(`Xóa danh mục "${name}"?`)) return
    const { error } = await supabase.from('categories').delete().eq('id', id)
    if (error) return toast.error(error.message)
    reload(); toast.success('Đã xóa danh mục')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{items.length} món</span>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCatOpen(true)}>⚙️ Danh mục</Button>
          <Button onClick={() => { setForm({ name: '', price: '', category_id: categories[0]?.id ?? null, is_available: true, is_default: false, no_cook: false, image_url: '', recipe: '' }); setOpen(true) }}><Plus className="mr-1 h-4 w-4"/>Thêm món</Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
        {items.map(it => (
          <Card key={it.id} className="overflow-hidden">
            <div className="aspect-square w-full overflow-hidden bg-muted relative">
              {(it as any).no_cook && <span className="absolute top-2 right-2 bg-blue-600 text-white font-bold text-[10px] px-2 py-0.5 rounded-md shadow-sm z-10 animate-pulse">có sẵn</span>}
              {it.image_url ? <img src={it.image_url} alt={it.name} className="h-full w-full object-cover" loading="lazy"/> : <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">Chưa có ảnh</div>}
            </div>
            <div className="p-3">
              <div className="font-bold">{it.name}</div>
              <div className="text-sm text-primary font-bold">{formatVND(it.price)}</div>
              <div className="mt-1 text-xs text-muted-foreground">{categories.find(c => c.id === it.category_id)?.name ?? '—'}</div>
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setForm({ ...it, price: it.price === 0 ? '' : it.price, no_cook: !!(it as any).no_cook, recipe: (it as any).recipe || '' }); setOpen(true) }}>Sửa</Button>
                <Button size="sm" variant="ghost" onClick={() => del(it.id)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={o => { if (!o) setForm({ name: '', price: '', category_id: categories[0]?.id ?? null, is_available: true, is_default: false, no_cook: false, image_url: '', recipe: '' }); setOpen(o) }}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden flex flex-col max-h-[85vh]">
          <DialogHeader className="p-6 pb-2 shrink-0"><DialogTitle>{form.id ? 'Sửa' : 'Thêm'} món</DialogTitle></DialogHeader>
          <ScrollArea className="flex-1 p-6 pt-0 overflow-y-auto">
            <div className="space-y-3 pr-1 py-1">
              <div><Label>Tên</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}/></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Giá</Label><Input type="number" value={form.price} placeholder="vd: 50000" onChange={(e) => setForm({ ...form, price: e.target.value === '' ? '' : Number(e.target.value) })}/></div>
                <div><Label>Danh mục</Label>
                  <Select value={form.category_id ?? ''} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Ảnh món</Label><ImageUpload value={form.image_url} onChange={(url) => setForm({ ...form, image_url: url })} folder="menu"/></div>
              <div className="flex items-center justify-between"><Label>Có sẵn</Label><Switch checked={form.is_available} onCheckedChange={(v) => setForm({ ...form, is_available: v })}/></div>
              <div className="flex items-center justify-between"><Label>Mặc định</Label><Switch checked={form.is_default} onCheckedChange={(v) => setForm({ ...form, is_default: v })}/></div>
              <div className="flex items-center justify-between border-t pt-3">
                <div><Label>Không cần chế biến</Label><p className="text-[11px] text-muted-foreground">Không bắn lệnh xuống bếp</p></div>
                <Switch checked={form.no_cook} onCheckedChange={(v) => setForm({ ...form, no_cook: v })}/>
              </div>
              <div className="space-y-1 border-t pt-3">
                <Label>Công thức / Ghi chú chế biến</Label>
                <Textarea rows={4} value={form.recipe ?? ''} placeholder="VD: 200g thịt bò, tỏi băm..." onChange={(e) => setForm({ ...form, recipe: e.target.value })} className="resize-none"/>
              </div>
            </div>
          </ScrollArea>
          <DialogFooter className="p-6 pt-2 border-t shrink-0"><Button onClick={save} className="w-full sm:w-auto">Lưu</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={catOpen} onOpenChange={setCatOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Quản lý danh mục</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Tên danh mục mới</Label>
              <div className="flex gap-2">
                <Input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="Ví dụ: Món lẩu..." onKeyDown={(e) => { if (e.key === 'Enter') addCat() }}/>
                <Button onClick={addCat}>Tạo mới</Button>
              </div>
            </div>
            <ScrollArea className="h-48 border rounded-lg p-2 bg-muted/20">
              {categories.map(c => (
                <div key={c.id} className="flex items-center justify-between bg-card border rounded-md p-2 mb-1.5 shadow-sm">
                  <span className="text-sm font-medium pl-1">{c.name}</span>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => delCat(c.id, c.name)}><Trash2 className="h-4 w-4"/></Button>
                </div>
              ))}
            </ScrollArea>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setCatOpen(false)}>Đóng</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─────────────────────────────────────────────
// TAB 3: ĐỊNH MỨC
// ─────────────────────────────────────────────
function RecipesTab() {
  const { items } = useMenu()
  const [ings, setIngs] = useState<any[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [recipe, setRecipe] = useState<any[]>([])
  const [newIng, setNewIng] = useState<{ ing: string; qty: number }>({ ing: '', qty: 0 })

  useEffect(() => {
    supabase.from('ingredients').select('*').order('name').then(({ data }) => setIngs(data ?? []))
  }, [])

  const loadRecipe = async (menuItemId: string) => {
    const { data } = await supabase.from('recipes').select('*, ingredients(name,unit)').eq('menu_item_id', menuItemId)
    setRecipe(data ?? [])
  }
  useEffect(() => { if (!sel) { setRecipe([]); return }; loadRecipe(sel) }, [sel])

  const add = async () => {
    if (!sel || !newIng.ing || !newIng.qty) return toast.error('Chọn nguyên liệu và nhập số lượng')
    if (recipe.some(r => r.ingredient_id === newIng.ing)) return toast.error('Nguyên liệu này đã có trong công thức.')
    const { error } = await supabase.from('recipes').insert({ menu_item_id: sel, ingredient_id: newIng.ing, quantity: newIng.qty })
    if (error) return toast.error(error.message)
    toast.success('Đã thêm'); setNewIng({ ing: '', qty: 0 }); loadRecipe(sel)
  }
  const del = async (id: string) => {
    if (!confirm('Xóa nguyên liệu này khỏi công thức?')) return
    const { error } = await supabase.from('recipes').delete().eq('id', id)
    if (error) return toast.error(error.message)
    toast.success('Đã xóa'); if (sel) loadRecipe(sel)
  }
  const updateQty = async (id: string, qty: number) => {
    if (!qty || qty <= 0) return
    const { error } = await supabase.from('recipes').update({ quantity: qty }).eq('id', id)
    if (error) return toast.error(error.message)
    toast.success('Đã cập nhật'); if (sel) loadRecipe(sel)
  }

  return (
    <div className="grid gap-4 md:grid-cols-[260px_1fr]">
      <Card className="p-3">
        <h2 className="mb-2 font-bold">Món ăn</h2>
        <div className="space-y-1 max-h-[70vh] overflow-y-auto">
          {items.map(it => (
            <button key={it.id} onClick={() => setSel(it.id)} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${sel === it.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
              {it.name}
            </button>
          ))}
        </div>
      </Card>
      <Card className="p-4">
        <h2 className="mb-3 font-bold">Định mức nguyên liệu</h2>
        {!sel && <p className="text-sm text-muted-foreground">Chọn món để chỉnh công thức.</p>}
        {sel && (
          <>
            <div className="space-y-2">
              {recipe.length === 0 && <p className="text-sm text-muted-foreground">Chưa có nguyên liệu nào.</p>}
              {recipe.map(r => (
                <div key={r.id} className="flex items-center gap-2 rounded border p-2">
                  <span className="flex-1 text-sm font-medium">{r.ingredients?.name}</span>
                  <Input type="number" className="w-24 h-8 text-sm" defaultValue={r.quantity} onBlur={(e) => updateQty(r.id, Number(e.target.value))}/>
                  <span className="text-xs text-muted-foreground w-8">{r.ingredients?.unit}</span>
                  <Button size="icon" variant="ghost" onClick={() => del(r.id)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-end gap-2 border-t pt-3">
              <div className="flex-1">
                <Select value={newIng.ing} onValueChange={(v) => setNewIng({ ...newIng, ing: v })}>
                  <SelectTrigger><SelectValue placeholder="Chọn nguyên liệu"/></SelectTrigger>
                  <SelectContent>{ings.map(i => <SelectItem key={i.id} value={i.id}>{i.name} ({i.unit})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Input type="number" className="w-28" placeholder="Số lượng" value={newIng.qty || ''} onChange={(e) => setNewIng({ ...newIng, qty: Number(e.target.value) })}/>
              <Button onClick={add}><Plus className="mr-1 h-4 w-4"/>Thêm</Button>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────
// TRANG CHÍNH — GỘP 3 TAB
// ─────────────────────────────────────────────
export default function MenuAndInventory() {
  const [searchParams] = useSearchParams()
  const [invRows, setInvRows] = useState<Ing[]>([])
  const lowStock = invRows.filter(r => r.stock < r.min_stock).length
  useEffect(() => {
  const load = async () => {
   const { data } = await supabase.from('ingredients').select('id, name, unit, stock, min_stock')
    const result = (data ?? []) as Ing[]
    setInvRows(result)
    // Bắn event để useGlobalCounts reload ngay
    window.dispatchEvent(new CustomEvent('ingredients-changed', { 
      detail: { lowStock: result.filter(r => r.stock < r.min_stock).length }
    }))
  }
  load()
  const ch = supabase.channel(`inv-low-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredients' }, load)
    .subscribe()
  return () => { supabase.removeChannel(ch) }
}, [])
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-bold">Cài đặt Menu & Tiện ích</h1>
     <Tabs defaultValue={searchParams.get('tab') === 'inventory' ? 'inventory' : 'menu'}>
        <TabsList>
          <TabsTrigger value="menu">Menu</TabsTrigger>
          <TabsTrigger value="inventory" className="relative gap-1.5">
            Nguyên liệu
            {lowStock > 0 && (
              <span className="rounded-full bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 leading-none">
                {lowStock}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="recipes">Định mức</TabsTrigger>
        </TabsList>
        <TabsContent value="inventory" className="mt-4"><InventoryTab onRowsChange={setInvRows} /></TabsContent>
        <TabsContent value="menu" className="mt-4"><MenuTab /></TabsContent>
        <TabsContent value="recipes" className="mt-4"><RecipesTab /></TabsContent>
      </Tabs>
    </div>
  )
}