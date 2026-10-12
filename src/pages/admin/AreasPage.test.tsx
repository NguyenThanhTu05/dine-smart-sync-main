import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HTMLAttributes, ReactNode } from 'react'
import type { AppRole } from '@/contexts/authState'
import type { RestaurantTable } from '@/hooks/useTables'
import WebAreasPage from './AreasPage'

const mock = vi.hoisted(() => ({
 role: 'cashier' as AppRole | null,
 tables: [] as RestaurantTable[],
 reload: vi.fn(), rpc: vi.fn(), send: vi.fn(), success: vi.fn(), error: vi.fn(),
 endWeb: undefined as undefined | ((source: string, target: { kind: string; id: string }) => void),
 disabled: {} as Record<string, boolean>,
}))
vi.mock('@/contexts/authState', () => ({ useAuth: () => ({ role: mock.role }) }))
vi.mock('@/hooks/useTables', () => ({ useTables: () => ({ tables: mock.tables, areas: [{ id: 'a', name: 'Khu A' }, { id: 'b', name: 'Khu B' }], reload: mock.reload }) }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mock.rpc } }))
vi.mock('@/lib/tableGroup', () => ({ getSharedBroadcastChannel: () => ({ send: mock.send }) }))
vi.mock('@/lib/notifications', () => ({ toast: { success: mock.success, error: mock.error } }))
vi.mock('@/components/tables/TouchTableDrag', () => ({
 TouchTableDnd: ({ children, onEnd }: { children: ReactNode; onEnd: typeof mock.endWeb }) => { mock.endWeb = onEnd; return children },
 TouchTableSurface: ({ tableId, disabledDrag, children, ...props }: HTMLAttributes<HTMLDivElement> & { tableId: string; disabledDrag: boolean }) => {
  mock.disabled[tableId] = disabledDrag; return <div {...props}>{children}</div>
 },
 TouchAreaSurface: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
const table = (id: string, status: RestaurantTable['status'] = 'empty', group: string | null = null): RestaurantTable => ({
 id, name: `Bàn ${id}`, area_id: 'a', seats: 4, sort_order: Number(id), status, merged_group_id: group,
})
beforeEach(() => {
 vi.clearAllMocks(); mock.role = 'cashier'; mock.tables = [table('1'),table('2')]; mock.disabled = {}
 mock.rpc.mockResolvedValue({ error: null }); mock.reload.mockResolvedValue(undefined); mock.send.mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('table layout permissions', () => {
 const Page = WebAreasPage
 const drop = (target: 'table' | 'area' = 'table') => act(() => {
  mock.endWeb!('1',{ kind: target,id: target === 'table' ? '2' : 'b' })
 })
 it.each(['admin','cashier'] as const)('allows %s to drag empty tables; only admin manages areas', role => {
  mock.role = role; render(<Page />)
  expect(mock.disabled['1']).toBe(false)
  expect(screen.getByRole('button',{ name: 'Thêm khu vực' })).toHaveProperty('disabled',role !== 'admin')
 })
 it.each(['staff','kitchen',null] as const)('blocks role %s even if a drag end is dispatched', async role => {
  mock.role = role; render(<Page />)
  expect(mock.disabled['1']).toBe(true); drop()
  expect(mock.rpc).not.toHaveBeenCalled()
 })
 it.each(['serving','awaiting_payment','needs_cleanup','merged'] as const)('protects %s tables from drag', status => {
  mock.tables[0] = status === 'merged' ? table('1','empty','g') : table('1',status)
  render(<Page />); expect(mock.disabled['1']).toBe(true); drop()
  expect(mock.rpc).not.toHaveBeenCalled()
 })
 it.each(['table','area'] as const)('submits cashier %s drop via RPC and reloads after success', async target => {
  render(<Page />); drop(target)
  await waitFor(() => expect(mock.success).toHaveBeenCalled())
  expect(mock.rpc).toHaveBeenCalledWith('restaurant_move_table',target === 'table' ? { p_source: '1',p_target: '2' } : { p_source: '1',p_area: 'b' })
  expect(mock.reload).toHaveBeenCalledTimes(1); expect(mock.send).toHaveBeenCalledTimes(1)
 })
 it('rejects an active destination before sending the RPC', () => {
  mock.tables[1].status = 'serving'; render(<Page />); drop()
  expect(mock.rpc).not.toHaveBeenCalled(); expect(mock.error).toHaveBeenCalled()
 })
 it('handles server rejection without broadcasting success or changing local positions', async () => {
  const before = structuredClone(mock.tables)
  mock.rpc.mockResolvedValue({ error: { message: 'Không có quyền thực hiện thao tác này.' } })
  render(<Page />); drop()
  await waitFor(() => expect(mock.error).toHaveBeenCalledWith('Không có quyền thực hiện thao tác này.'))
  expect(mock.success).not.toHaveBeenCalled(); expect(mock.send).not.toHaveBeenCalled()
  expect(mock.reload).toHaveBeenCalledTimes(1); expect(mock.tables).toEqual(before)
 })
 it('blocks duplicate drops while the first RPC is pending', async () => {
  let finish!: (value: { error: null }) => void
  mock.rpc.mockReturnValue(new Promise(resolve => { finish = resolve }))
  render(<Page />); drop(); drop()
  expect(mock.rpc).toHaveBeenCalledTimes(1); expect(mock.disabled['1']).toBe(true)
  await act(async () => finish({ error: null }))
  expect(mock.disabled['1']).toBe(false)
 })
})
