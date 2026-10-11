import { beforeEach,describe,expect,it,vi } from 'vitest'
import { stockTransaction } from './inventoryTransactions'
const mock = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mock.rpc } }))
beforeEach(() => { sessionStorage.clear(); vi.clearAllMocks() })
describe('stock request retries', () => {
  it('retains the same key after an uncertain response, then starts a distinct import after success', async () => {
    mock.rpc.mockResolvedValueOnce({ error: new Error('lost response') }).mockResolvedValue({ data: {}, error: null })
    await expect(stockTransaction('adjust', 'ingredient', { delta: 1 })).rejects.toThrow('lost response')
    const key = mock.rpc.mock.calls[0][1].p_request
    await stockTransaction('adjust', 'ingredient', { delta: 1 })
    expect(mock.rpc.mock.calls[1][1].p_request).toBe(key)
    await stockTransaction('adjust', 'ingredient', { delta: 1 })
    expect(mock.rpc.mock.calls[2][1].p_request).not.toBe(key)
  })
  it('fails clearly when the RPC is missing and does not send a fallback write', async () => {
    mock.rpc.mockResolvedValue({ error: new Error('missing RPC') })
    await expect(stockTransaction('create', null, { name: 'A' })).rejects.toThrow('missing RPC')
    expect(mock.rpc).toHaveBeenCalledTimes(1)
  })
})
