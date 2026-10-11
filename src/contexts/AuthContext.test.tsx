import { act,cleanup,renderHook,waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach,beforeEach,expect,it,vi } from 'vitest'
import { AuthProvider } from './AuthContext'
import { useAuth } from './authState'
const mock=vi.hoisted(()=>({handler:vi.fn<(event:string, session:unknown)=>void>(),roles:vi.fn(),getSession:vi.fn(),removeChannel:vi.fn()}))
vi.mock('@/integrations/supabase/client',()=>({supabase:{
  auth:{onAuthStateChange:(fn:typeof mock.handler)=>{mock.handler=fn;return {data:{subscription:{unsubscribe:vi.fn()}}}},getSession:mock.getSession},
  from:()=>({select:()=>({eq:mock.roles})}),
  channel:()=>{const ch={on:()=>ch,subscribe:()=>ch};return ch},removeChannel:mock.removeChannel,
}}))
const wrapper=({children}:{children:ReactNode})=><AuthProvider>{children}</AuthProvider>
beforeEach(()=>{vi.clearAllMocks();sessionStorage.clear();mock.getSession.mockResolvedValue({data:{session:null},error:null})})
afterEach(cleanup)
it('ignores an old admin role response after switching accounts',async()=>{
  let finish!:(data:unknown)=>void
  mock.roles.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve})).mockResolvedValue({data:[{role:'staff'}],error:null})
  const hook=renderHook(()=>useAuth(),{wrapper})
  await waitFor(()=>expect(hook.result.current.loading).toBe(false))
  act(()=>mock.handler('SIGNED_IN',{user:{id:'admin-old'}}))
  await waitFor(()=>expect(mock.roles).toHaveBeenCalledTimes(1))
  act(()=>mock.handler('SIGNED_IN',{user:{id:'staff-new'}}))
  await waitFor(()=>expect(hook.result.current.role).toBe('staff'))
  await act(async()=>finish({data:[{role:'admin'}],error:null}))
  expect(hook.result.current.role).toBe('staff')
  act(()=>mock.handler('SIGNED_OUT',null))
  expect(hook.result.current.role).toBeNull()
})
it('fails closed for ambiguous roles and query errors',async()=>{
  mock.roles.mockResolvedValueOnce({data:[{role:'admin'},{role:'staff'}],error:null}).mockResolvedValueOnce({data:null,error:{message:'offline'}})
  const hook=renderHook(()=>useAuth(),{wrapper})
  act(()=>mock.handler('SIGNED_IN',{user:{id:'one'}}))
  await waitFor(()=>expect(mock.roles).toHaveBeenCalledTimes(1))
  await waitFor(()=>expect(hook.result.current.loading).toBe(false))
  expect(hook.result.current.role).toBeNull()
  act(()=>mock.handler('SIGNED_IN',{user:{id:'two'}}))
  await waitFor(()=>expect(mock.roles).toHaveBeenCalledTimes(2))
  await waitFor(()=>expect(hook.result.current.loading).toBe(false))
  expect(hook.result.current.role).toBeNull()
})
