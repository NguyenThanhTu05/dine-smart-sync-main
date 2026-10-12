import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { NotificationProvider } from './NotificationProvider'
import { useGlobalCounts } from '@/hooks/useGlobalCounts'
import { emptyCounts } from '@/lib/notificationCounts'
import type { ReactNode } from 'react'
const mock = vi.hoisted(() => ({
  auth: { user: { id: 'staff' }, role: 'staff' as 'staff' | 'admin' | 'kitchen', isRecovery: false }, load: vi.fn(),
  order: () => {}, table: () => {}, stopOrder: vi.fn(), stopTable: vi.fn(), channel: vi.fn(), remove: vi.fn(),
}))
vi.mock('./authState', () => ({ useAuth: () => mock.auth }))
vi.mock('@/lib/notificationCounts', async original => ({ ...await original<typeof import('@/lib/notificationCounts')>(), loadNotificationCounts: mock.load }))
vi.mock('@/lib/orderSync', () => ({ subscribeOrderChanges: (listener: () => void) => { mock.order = listener; return mock.stopOrder } }))
vi.mock('@/lib/tableSync', () => ({ subscribeTableChanges: (listener: () => void) => { mock.table = listener; return mock.stopTable } }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { channel: mock.channel, removeChannel: mock.remove } }))
const wrapper = ({ children }: { children: ReactNode }) => <NotificationProvider>{children}</NotificationProvider>
const response = (readyByTable = {}) => ({ counts: { ...emptyCounts(), readyByTable }, readyFailed: false })
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); mock.auth = { user: { id: 'staff' }, role: 'staff', isRecovery: false }; mock.load.mockResolvedValue(response()) })
afterEach(() => { cleanup(); vi.useRealTimers() })

it('uses one initial read for multiple consumers and coalesces mixed Realtime events', async () => {
  const hook = renderHook(() => [useGlobalCounts(), useGlobalCounts()], { wrapper })
  await act(async () => {})
  expect(mock.load).toHaveBeenCalledTimes(1)
  act(() => { mock.order(); mock.table(); window.dispatchEvent(new Event('sync-group-status')); window.dispatchEvent(new Event('focus')) })
  await act(() => vi.advanceTimersByTimeAsync(100))
  expect(mock.load).toHaveBeenCalledTimes(2)
  expect(hook.result.current[0]).toBe(hook.result.current[1])
})
it('does not commit an old ready count when a newer serving event arrives during a read', async () => {
  let finish!: (value: ReturnType<typeof response>) => void
  mock.load.mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValue(response({ table: 0 }))
  const hook = renderHook(useGlobalCounts, { wrapper })
  act(() => mock.order())
  await act(async () => finish(response({ table: 5 })))
  expect(hook.result.current.readyByTable).toEqual({})
  await act(() => vi.advanceTimersByTimeAsync(100))
  expect(hook.result.current.readyByTable).toEqual({ table: 0 })
  expect(mock.load).toHaveBeenCalledTimes(2)
})
it('updates ready quantities on kitchen completion and removes them after serving', async () => {
  const hook = renderHook(useGlobalCounts, { wrapper })
  await act(async () => {})
  mock.load.mockResolvedValue(response({ table: 3 }))
  act(() => mock.order()); await act(() => vi.advanceTimersByTimeAsync(100))
  expect(hook.result.current.readyByTable.table).toBe(3)
  mock.load.mockResolvedValue(response())
  act(() => mock.order()); await act(() => vi.advanceTimersByTimeAsync(100))
  expect(hook.result.current.readyByTable.table).toBeUndefined()
})
it('discards responses from a previous account and releases its subscriptions', async () => {
  let finish!: (value: ReturnType<typeof response>) => void
  mock.load.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const hook = renderHook(useGlobalCounts, { wrapper })
  mock.auth = { user: { id: 'kitchen' }, role: 'kitchen', isRecovery: false }
  hook.rerender(); await act(async () => {})
  await act(async () => finish(response({ privateTable: 8 })))
  expect(hook.result.current.readyByTable).toEqual({})
  expect(mock.stopOrder).toHaveBeenCalledTimes(1)
  expect(mock.stopTable).toHaveBeenCalledTimes(1)
  expect(mock.channel).not.toHaveBeenCalled()
})
it('cancels queued work on unmount', async () => {
  const hook = renderHook(useGlobalCounts, { wrapper }); await act(async () => {})
  act(() => mock.order()); hook.unmount()
  await act(() => vi.advanceTimersByTimeAsync(1000))
  expect(mock.load).toHaveBeenCalledTimes(1)
  expect(mock.stopOrder).toHaveBeenCalledTimes(1)
})
it('recovers after a failed read without showing stale ready counts', async () => {
  mock.load.mockRejectedValueOnce(new Error('network failed'))
  const hook = renderHook(useGlobalCounts, { wrapper }); await act(async () => {})
  expect(hook.result.current.readyError).toBe(true)
  expect(hook.result.current.readyByTable).toEqual({})
  mock.load.mockResolvedValue(response({ table: 2 }))
  act(() => window.dispatchEvent(new Event('online')))
  await act(() => vi.advanceTimersByTimeAsync(100))
  expect(hook.result.current.readyError).toBe(false)
  expect(hook.result.current.readyByTable.table).toBe(2)
})
