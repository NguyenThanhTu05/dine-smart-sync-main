import { beforeEach,expect,it,vi } from 'vitest';
const mock = vi.hoisted(() => ({ channel: vi.fn(), removeChannel: vi.fn(), send: vi.fn(), callbacks: new Map<string, () => void>() }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: mock }))
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); mock.callbacks.clear()
  const ch = { on: vi.fn((type, filter, cb) => { mock.callbacks.set(`${type}:${filter.table ?? filter.event}`, cb); return ch }), subscribe: vi.fn(() => ch), send: mock.send }
  mock.channel.mockReturnValue(ch)
})
it('keeps the shared subscription while another table view is mounted', async () => {
  const { subscribeTableChanges } = await import('./tableSync')
  const a = vi.fn(), b = vi.fn(), stopA = subscribeTableChanges(a), stopB = subscribeTableChanges(b)
  expect(mock.channel).toHaveBeenCalledTimes(1)
  stopA(); mock.callbacks.get('postgres_changes:restaurant_tables')!()
  expect(a).not.toHaveBeenCalled(); expect(b).toHaveBeenCalledTimes(1)
  expect(mock.removeChannel).not.toHaveBeenCalled()
  stopB(); expect(mock.removeChannel).toHaveBeenCalledTimes(1)
})
it('does not remove a channel during an outstanding broadcast and releases it on failure', async () => {
  const { subscribeTableChanges, tableBroadcaster } = await import('./tableSync')
  let reject!: (error: Error) => void
  mock.send.mockReturnValue(new Promise((_, fail) => { reject = fail }))
  const stop = subscribeTableChanges(vi.fn())
  const pending = tableBroadcaster.send({ type: 'broadcast', event: 'table-status-changed', payload: {} })
  stop(); expect(mock.removeChannel).not.toHaveBeenCalled()
  reject(new Error('offline')); await expect(pending).rejects.toThrow('offline')
  expect(mock.removeChannel).toHaveBeenCalledTimes(1)
})
