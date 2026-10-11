import { act,renderHook,waitFor } from '@testing-library/react'
import { expect,it,vi } from 'vitest'
import { useTables } from './useTables'
const mock=vi.hoisted(()=>({from:vi.fn(),listener:()=>{},stop:vi.fn()}))
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:mock.from}}))
vi.mock('@/lib/tableSync',()=>({subscribeTableChanges:(fn:()=>void)=>{mock.listener=fn;return mock.stop}}))
vi.mock('@/lib/restaurantTransactions',()=>({readableError:(e:Error)=>e.message}))
function query(result:Promise<unknown>|unknown) {
  const q={select:()=>q,order:()=>q,then:(resolve:(r:unknown)=>void)=>Promise.resolve(result).then(resolve)}
  return q
}
it('ignores an old response after a newer table update and preserves data on server failure',async()=>{
  let old!: (value:unknown)=>void
  mock.from.mockReturnValueOnce(query(new Promise(resolve=>{old=resolve})))
    .mockReturnValueOnce(query({data:[],error:null}))
    .mockReturnValueOnce(query({data:[{id:'table',status:'serving'}],error:null}))
    .mockReturnValueOnce(query({data:[],error:null}))
  const hook=renderHook(()=>useTables())
  act(()=>mock.listener())
  await waitFor(()=>expect(hook.result.current.tables[0]?.status).toBe('serving'))
  await act(async()=>old({data:[{id:'table',status:'empty'}],error:null}))
  expect(hook.result.current.tables[0]?.status).toBe('serving')
  mock.from.mockReturnValue(query({data:null,error:new Error('server down')}))
  await act(async()=>hook.result.current.reload())
  expect(hook.result.current.error).toBe('server down')
  expect(hook.result.current.tables[0]?.status).toBe('serving')
  hook.unmount(); expect(mock.stop).toHaveBeenCalled()
})
