import type { Database, Tables } from '@/integrations/supabase/types'
export type Ingredient = Tables<'ingredients'>
export type Recipe = Tables<'recipes'> & { ingredients?: Pick<Ingredient,'name'|'unit'> | null }
export type Profile = Tables<'profiles'>
export type DirectoryMember = Database['public']['Functions']['restaurant_directory']['Returns'][number]
export type OrderItem = Tables<'order_items'>
export type BillItem = Pick<OrderItem,'id'|'name_snapshot'|'price_snapshot'|'quantity'|'notes'|'status'|'no_cook'> & Partial<Omit<OrderItem,'menu_item_id'>> & {menu_item_id?: string | null}
export type Order = Tables<'orders'> & {
  order_items: BillItem[]
  restaurant_tables?: { name: string; merged_group_id?: string | null; areas?: {name: string} | null } | null
}
export type AttendanceLog = Tables<'attendance_logs'>
export type StaffProfile = Omit<Profile,'visible_password'> & { role: string }
