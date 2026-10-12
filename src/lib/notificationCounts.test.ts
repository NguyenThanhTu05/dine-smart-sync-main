import { beforeEach, expect, it, vi } from 'vitest'
import type { RestaurantTable } from '@/hooks/useTables'
import { countTableAlerts, loadNotificationCounts, readyCountForTable } from './notificationCounts'
const mock = vi.hoisted(() => ({ queries: [] as { table: string; select: string; filters: unknown[][] }[], failStock: false, failReady: false, failTables: false,
  tables: [] as Pick<RestaurantTable, 'id' | 'status' | 'merged_group_id'>[],
  rows: [] as { id: string; quantity: number; orders: { table_id: string; is_paid: boolean } }[] }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => {
  const record = { table, select: '', filters: [] as unknown[][] }; mock.queries.push(record)
  const query = {
    select: (columns: string) => { record.select = columns; return query },
    eq: (...args: unknown[]) => { record.filters.push(args); return query },
    in: (...args: unknown[]) => { record.filters.push(args); return query },
    order: () => query,
    range: async (offset: number, last: number) => table === 'ingredients'
      ? { data: [{ stock: -1, min_stock: 2 }], error: mock.failStock ? { message: 'forbidden' } : null }
      : table === 'restaurant_tables' ? { data: mock.tables.slice(offset, last + 1), error: mock.failTables ? { message: 'offline' } : null }
      : { data: mock.rows.slice(offset, last + 1), error: mock.failReady ? { message: 'offline' } : null },
    then: (resolve: (result: unknown) => void) => resolve({ count: 4, error: null }),
  }; return query
} } }))
beforeEach(() => { mock.queries = []; mock.failStock = false; mock.failReady = false; mock.failTables = false; mock.rows = []
  mock.tables = Array.from({ length: 4 }, (_, index) => ({ id: String(index), status: 'awaiting_payment', merged_group_id: null }))
})

it('kitchen only counts pending/cooking items that require cooking in unpaid orders', async () => {
  const result = await loadNotificationCounts('kitchen')
  expect(mock.queries.map(query => query.table)).toEqual(['order_items'])
  expect(mock.queries[0].filters).toEqual([['status', ['pending', 'cooking']], ['no_cook', false], ['orders.is_paid', false]])
  expect(result.counts.kitchenPending).toBe(4)
})
it.each(['staff', 'cashier'] as const)('%s never reads stock for menu badges', async role => {
  await loadNotificationCounts(role)
  expect(mock.queries.some(query => query.table === 'ingredients')).toBe(false)
})
it('counts units awaiting service and requests only done items from unpaid invoices', async () => {
  mock.rows = [{ id: 'a', quantity: 3, orders: { table_id: 't1', is_paid: false } }, { id: 'b', quantity: 1, orders: { table_id: 't1', is_paid: false } }, { id: 'paid', quantity: 10, orders: { table_id: 't2', is_paid: true } }]
  const result = await loadNotificationCounts('staff')
  expect(result.counts.readyByTable).toEqual({ t1: 4 })
  expect(mock.queries.find(query => query.table === 'order_items')?.filters).toEqual([['status', 'done'], ['orders.is_paid', false]])
})
it('does not lose valid order badges when the inventory query fails', async () => {
  mock.failStock = true
  const result = await loadNotificationCounts('admin')
  expect(result.counts).toMatchObject({ tableAlerts: 4, openBills: 4, readyByTable: {} })
  expect(result.failed).toBe(true)
  expect(result.readyFailed).toBe(false)
})
it('clears uncertain ready counts and marks the error instead of showing stale meal counts', async () => {
  mock.failReady = true
  const result = await loadNotificationCounts('staff')
  expect(result.readyFailed).toBe(true)
  expect(result.counts.readyByTable).toEqual({})
  expect(result.counts.tableAlerts).toBe(4)
})
it('reads all pages instead of silently truncating at 1000 ready items', async () => {
  mock.rows = Array.from({ length: 1001 }, (_, index) => ({ id: String(index), quantity: 1, orders: { table_id: 'table', is_paid: false } }))
  expect((await loadNotificationCounts('staff')).counts.readyByTable).toEqual({ table: 1001 })
})
it('shares group counts without attributing them to another group or moving any tables', () => {
  const tables = [{ id: 'a', merged_group_id: 'g' }, { id: 'b', merged_group_id: null }, { id: 'c', merged_group_id: 'g' }, { id: 'd', merged_group_id: 'other' }]
  const counts = { a: 2, b: 1, c: 3, d: 9 }
  expect(readyCountForTable(tables[0], tables, counts)).toBe(5)
  expect(readyCountForTable(tables[2], tables, counts)).toBe(5)
  expect(readyCountForTable(tables[1], tables, counts)).toBe(1)
  expect(tables.map(table => table.id)).toEqual(['a', 'b', 'c', 'd'])
})

it('counts notified tables once per group, deduplicating dishes and payment requests', () => {
  const tables: typeof mock.tables = [
    { id: 'a', status: 'serving', merged_group_id: 'g' },
    { id: 'b', status: 'serving', merged_group_id: 'g' },
    { id: 'c', status: 'awaiting_payment', merged_group_id: 'g' },
    { id: 'd', status: 'serving', merged_group_id: null },
    { id: 'e', status: 'needs_cleanup', merged_group_id: null },
    { id: 'f', status: 'empty', merged_group_id: null },
  ]
  expect(countTableAlerts(tables, { a: 5, b: 2, d: 9, e: 3, f: 1 })).toBe(2)
})
it('updates the menu from ready items as well as payment status, and clears it when served', async () => {
  mock.tables = [{ id: 'a', status: 'serving', merged_group_id: 'g' }, { id: 'b', status: 'serving', merged_group_id: 'g' }]
  mock.rows = [{ id: 'item', quantity: 7, orders: { table_id: 'b', is_paid: false } }]
  expect((await loadNotificationCounts('staff')).counts.tableAlerts).toBe(1)
  mock.rows = []
  expect((await loadNotificationCounts('staff')).counts.tableAlerts).toBe(0)
})
it('does not display an unverified badge after table/group information fails to load', async () => {
  mock.failTables = true
  const result = await loadNotificationCounts('staff')
  expect(result.counts.tableAlerts).toBe(0)
  expect(result.counts.readyByTable).toEqual({})
  expect(result.readyFailed).toBe(true)
})
