import { beforeEach,describe,expect,it,vi } from 'vitest'
import { deleteEmptyArea, deleteEmptyTable } from './tableDeletion'

const mock = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mock.from } }))

function query(result: unknown) {
  const builder = {
    select: vi.fn(() => builder), eq: vi.fn(() => builder),
    in: vi.fn(() => builder), is: vi.fn(() => builder), delete: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (value: unknown) => void) => Promise.resolve(result).then(resolve),
  }
  return builder
}

beforeEach(() => vi.clearAllMocks())

describe('table deletion safeguards', () => {
  it.each(['serving', 'awaiting_payment', 'needs_cleanup'])('rejects a %s table without deleting', async status => {
    const table = query({ data: { status, merged_group_id: null }, error: null })
    mock.from.mockReturnValue(table)
    await expect(deleteEmptyTable('table')).rejects.toThrow('đang hoạt động')
    expect(table.delete).not.toHaveBeenCalled()
  })

  it('keeps paid bill history even when the table is empty', async () => {
    const table = query({ data: { status: 'empty', merged_group_id: null }, error: null })
    const orders = query({ count: 2, error: null })
    mock.from.mockReturnValueOnce(table).mockReturnValueOnce(query({ count: 0, error: null })).mockReturnValueOnce(orders)
    await expect(deleteEmptyTable('table')).rejects.toThrow('lịch sử')
    expect(orders.eq.mock.calls).toEqual([['table_id', 'table']])
    expect(table.delete).not.toHaveBeenCalled()
  })

  it('does not delete if the history check fails', async () => {
    const table = query({ data: { status: 'empty', merged_group_id: null }, error: null })
    mock.from.mockReturnValueOnce(table).mockReturnValueOnce(query({ count: 0, error: null })).mockReturnValueOnce(query({ count: null, error: new Error('network') }))
    await expect(deleteEmptyTable('table')).rejects.toThrow('network')
    expect(table.delete).not.toHaveBeenCalled()
  })

  it('surfaces a FK error when an order is created concurrently', async () => {
    const table = query({ data: { status: 'empty', merged_group_id: null }, error: null })
    mock.from.mockReturnValueOnce(table).mockReturnValueOnce(query({ count: 0, error: null }))
      .mockReturnValueOnce(query({ count: 0, error: null }))
      .mockReturnValueOnce(query({ data: null, error: new Error('FK RESTRICT') }))
    await expect(deleteEmptyTable('table')).rejects.toThrow('FK RESTRICT')
  })

  it('allows deleting only an empty ungrouped table with no history', async () => {
    const deletion = query({ data: [{ id: 'table' }], error: null })
    mock.from.mockReturnValueOnce(query({ data: { status: 'empty', merged_group_id: null }, error: null })).mockReturnValueOnce(query({ count: 0, error: null }))
      .mockReturnValueOnce(query({ count: 0, error: null })).mockReturnValueOnce(deletion)
    await expect(deleteEmptyTable('table')).resolves.toBeUndefined()
    expect(deletion.eq.mock.calls).toEqual([['id', 'table'], ['status', 'empty']])
    expect(deletion.is).toHaveBeenCalledWith('merged_group_id', null)
  })
})

describe('additional layout protection', () => {
  it('rejects a primary table still referenced by a group', async () => {
    mock.from.mockReturnValueOnce(query({ data: { status: 'empty', merged_group_id: null }, error: null }))
      .mockReturnValueOnce(query({ count: 1, error: null }))
    await expect(deleteEmptyTable('table')).rejects.toThrow('liên kết nhóm')
    expect(mock.from).toHaveBeenCalledTimes(2)
  })
  it('rejects an empty merged table', async () => {
    mock.from.mockReturnValueOnce(query({ data: { status: 'empty', merged_group_id: 'group' }, error: null }))
    await expect(deleteEmptyTable('table')).rejects.toThrow('ghép nhóm')
    expect(mock.from).toHaveBeenCalledTimes(1)
  })
  it.each(['serving', 'awaiting_payment', 'needs_cleanup'])('rejects an area with %s tables', async status => {
    mock.from.mockReturnValueOnce(query({ data: [{ id: 'table', status, merged_group_id: null }], error: null }))
    await expect(deleteEmptyArea('area')).rejects.toThrow('đang hoạt động')
    expect(mock.from).toHaveBeenCalledTimes(1)
  })
  it('fails closed when the area table count is unknown', async () => {
    mock.from.mockReturnValueOnce(query({ data: null, error: null }))
    await expect(deleteEmptyArea('area')).rejects.toThrow('Chưa kiểm tra')
  })
  it('surfaces a server guard when another account adds a table', async () => {
    mock.from.mockReturnValueOnce(query({ data: [], error: null }))
      .mockReturnValueOnce(query({ error: new Error('Khu vực còn bàn') }))
    await expect(deleteEmptyArea('area')).rejects.toThrow('còn bàn')
  })
  it('allows an empty area only after a successful server deletion', async () => {
    mock.from.mockReturnValueOnce(query({ data: [], error: null }))
      .mockReturnValueOnce(query({ data: [{ id: 'area' }], error: null }))
    await expect(deleteEmptyArea('area')).resolves.toBeUndefined()
  })
})

it('allows an area with inactive ungrouped tables and no open orders', async () => {
  mock.from.mockReturnValueOnce(query({ data: [{ id: 'table', status: 'empty', merged_group_id: null }], error: null }))
    .mockReturnValueOnce(query({ count: 0, error: null }))
    .mockReturnValueOnce(query({ count: 0, error: null }))
    .mockReturnValueOnce(query({ data: [{ id: 'area' }], error: null }))
  await expect(deleteEmptyArea('area')).resolves.toBeUndefined()
})
