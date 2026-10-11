import { act,renderHook,waitFor } from '@testing-library/react';
import { expect,it,vi } from 'vitest';
import { useOrderSync } from './useOrderSync';
const state = vi.hoisted(() => ({ listener: () => {}, stop: vi.fn() }))
vi.mock('@/lib/orderSync', () => ({ subscribeOrderChanges: (fn: () => void) => { state.listener = fn; return state.stop } }))
it('recovers after server errors without overlapping refreshes', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const reload = vi.fn().mockRejectedValueOnce(new Error('server failed')).mockResolvedValue(undefined)
  const hook = renderHook(() => useOrderSync(reload, 'table'))
  await waitFor(() => expect(log).toHaveBeenCalled())
  act(() => state.listener())
  await waitFor(() => expect(reload).toHaveBeenCalledTimes(2))
  hook.unmount(); log.mockRestore()
})
it('coalesces concurrent events and stops queued refreshes on unmount', async () => {
  let finish!: () => void
  const reload = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
  const hook = renderHook(() => useOrderSync(reload, 'table'))
  act(() => { state.listener(); state.listener() })
  expect(reload).toHaveBeenCalledTimes(1)
  hook.unmount(); await act(async () => finish())
  expect(reload).toHaveBeenCalledTimes(1)
})
