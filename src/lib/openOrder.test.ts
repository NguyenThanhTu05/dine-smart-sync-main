import { beforeEach,expect,it,vi } from 'vitest'
import { readOpenOrder } from './openOrder'
const mock=vi.hoisted(()=>({rpc:vi.fn()}))
vi.mock('@/integrations/supabase/client',()=>({supabase:mock}))
beforeEach(()=>vi.clearAllMocks())
it('resolves the current group on the server instead of using cached membership',async()=>{
  const invoice={id:'order',order_items:[{id:'new'}]}
  mock.rpc.mockResolvedValue({data:invoice,error:null})
  expect(await readOpenOrder({id:'table',merged_group_id:'stale-group'})).toEqual(invoice)
  expect(mock.rpc).toHaveBeenCalledWith('restaurant_open_order',{p_table:'table'})
})
it('preserves server errors and duplicate invoice errors',async()=>{
  mock.rpc.mockResolvedValue({data:null,error:new Error('nhiều hóa đơn mở')})
  await expect(readOpenOrder({id:'table',merged_group_id:null})).rejects.toThrow('nhiều hóa đơn')
})
it('returns null only after a successful empty read',async()=>{
  mock.rpc.mockResolvedValue({data:null,error:null})
  expect(await readOpenOrder({id:'table',merged_group_id:null})).toBeNull()
})
