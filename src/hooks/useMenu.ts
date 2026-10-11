import { supabase } from '@/integrations/supabase/client';
import { useCallback,useEffect,useRef,useState } from 'react';

export interface MenuItem {
  id: string; name: string; price: number; image_url: string | null
  is_available: boolean; is_default: boolean; category_id: string | null; no_cook: boolean | null; recipe: string | null
}
export interface Category { id: string; name: string; sort_order: number }

export function useMenu() {
  const [items, setItems] = useState<MenuItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const generation = useRef(0)
  const invalidategeneration = useCallback(() => { generation.current++ }, [])
  const reload = useCallback(async () => {
    const version = ++generation.current
    try {
      const [m,c] = await Promise.all([
        supabase.from('menu_items').select('*').order('name'),
        supabase.from('categories').select('*').order('sort_order'),
      ])
      if (version !== generation.current) return
      if (m.error || c.error) throw m.error ?? c.error
      setItems(m.data ?? []); setCategories(c.data ?? [])
    } catch (error) { console.error('Không tải được thực đơn', error) }
    finally { if (version === generation.current) setLoading(false) }
  }, [])
  useEffect(() => {
    void reload()
    const refresh = () => { void reload() }
    const ch = supabase.channel(`menu-rt-${crypto.randomUUID()}`)
      .on('postgres_changes', {event:'*',schema:'public',table:'menu_items'},refresh)
      .on('postgres_changes', {event:'*',schema:'public',table:'categories'},refresh)
      .subscribe(status => { if (status==='SUBSCRIBED') refresh() })
    window.addEventListener('focus',refresh)
    return () => { invalidategeneration(); window.removeEventListener('focus',refresh); void supabase.removeChannel(ch) }
  }, [reload, invalidategeneration])
  return { items, categories, loading, reload }
}
