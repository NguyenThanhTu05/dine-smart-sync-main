import { beforeEach,describe,expect,it,vi } from 'vitest'

const mock = vi.hoisted(() => ({
  handlers: new Map<string, () => void>(),
  send: vi.fn(),
  removeChannel: vi.fn(),
  channel: vi.fn(),
}))

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { channel: mock.channel, removeChannel: mock.removeChannel },
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mock.handlers.clear()
  const channel = {
    on: vi.fn((type, filter, callback) => {
      mock.handlers.set(`${type}:${filter.table ?? filter.event}`, callback)
      return channel
    }),
    subscribe: vi.fn(() => channel),
    send: mock.send,
  }
  mock.channel.mockReturnValue(channel)
})

describe('order synchronization', () => {
  it('refreshes every local consumer after remote kitchen updates and cancellations', async () => {
    const { subscribeOrderChanges } = await import('./orderSync')
    const kitchen = vi.fn(), serving = vi.fn()
    const stopKitchen = subscribeOrderChanges(kitchen)
    const stopServing = subscribeOrderChanges(serving)
    expect(mock.channel).toHaveBeenCalledTimes(1)
    mock.handlers.get('broadcast:orders-changed')!()
    mock.handlers.get('postgres_changes:order_items')!()
    expect(kitchen).toHaveBeenCalledTimes(2)
    expect(serving).toHaveBeenCalledTimes(2)
    stopServing()
    mock.handlers.get('postgres_changes:orders')!()
    expect(kitchen).toHaveBeenCalledTimes(3)
    expect(serving).toHaveBeenCalledTimes(2)
    expect(mock.removeChannel).not.toHaveBeenCalled()
    stopKitchen()
    expect(mock.removeChannel).toHaveBeenCalledTimes(1)
  })

  it('notifies local panels and other accounts after a successful mutation', async () => {
    const { subscribeOrderChanges, notifyOrderChanges } = await import('./orderSync')
    const refresh = vi.fn()
    const stop = subscribeOrderChanges(refresh)
    notifyOrderChanges()
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(mock.send).toHaveBeenCalledWith({ type: 'broadcast', event: 'orders-changed', payload: {} })
    await Promise.resolve(); await Promise.resolve()
    stop()
    subscribeOrderChanges(vi.fn())()
    expect(mock.channel).toHaveBeenCalledTimes(2)
  })
})
