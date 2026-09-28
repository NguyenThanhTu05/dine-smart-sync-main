import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'

export interface MenuItem {
  id: string; name: string; price: number; image_url: string | null
  is_available: boolean; is_default: boolean; category_id: string | null
}
export interface Category { id: string; name: string; sort_order: number }

export function useMenu() {
  const [items, setItems] = useState<MenuItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const reload = async () => {
    const [{ data: m }, { data: c }] = await Promise.all([
      supabase.from('menu_items').select('*').order('name'),
      supabase.from('categories').select('*').order('sort_order'),
    ])
    setItems((m ?? []) as MenuItem[]); setCategories((c ?? []) as Category[]); setLoading(false)
  }
  useEffect(() => {
    reload()
    const ch = supabase.channel(`menu-rt-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, reload)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])
  return { items, categories, loading, reload }
}
