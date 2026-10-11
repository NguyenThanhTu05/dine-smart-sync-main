import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { afterEach,beforeEach,expect,it,vi } from 'vitest'
import { AttendanceCard } from './AttendanceCard'
const mock=vi.hoisted(()=>({rpc:vi.fn(),position:vi.fn(),error:vi.fn()}))
vi.mock('@/contexts/authState',()=>({useAuth:()=>({user:{id:'staff'}})}))
vi.mock('@/lib/geo',()=>({getCurrentPosition:mock.position,haversineMeters:()=>0}))
vi.mock('sonner',()=>({toast:{error:mock.error,success:vi.fn()}}))
vi.mock('@/integrations/supabase/client',()=>({supabase:{
  rpc:mock.rpc,removeChannel:vi.fn(),
  channel:()=>{const ch={on:()=>ch,subscribe:()=>ch};return ch},
  from:(table:string)=>{
    const result={data:table==='attendance_settings'?{latitude:10,longitude:106,radius_m:100}:[],error:null}
    const q={select:()=>q,eq:()=>q,gte:()=>q,lt:()=>q,order:()=>q,maybeSingle:()=>q,then:(resolve:(r:unknown)=>void)=>Promise.resolve(result).then(resolve)}
    return q
  },
}}))
beforeEach(()=>{
  vi.clearAllMocks()
  mock.position.mockResolvedValueOnce({coords:{latitude:10,longitude:106}}).mockResolvedValue({coords:{latitude:10.0001,longitude:106.0001}})
})
afterEach(cleanup)
it('fetches fresh GPS on submission and sends no client time or distance',async()=>{
  mock.rpc.mockResolvedValue({data:{},error:null})
  render(<AttendanceCard/>)
  await waitFor(()=>expect(screen.getByRole('button',{name:'Check-in'})).toBeEnabled())
  fireEvent.click(screen.getByRole('button',{name:'Check-in'}))
  await waitFor(()=>expect(mock.rpc).toHaveBeenCalled())
  expect(mock.rpc).toHaveBeenCalledWith('restaurant_attendance',{
    p_kind:'in',p_lat:10.0001,p_lon:106.0001,p_request:expect.any(String),
  })
})
it('reports server errors and releases the busy state',async()=>{
  mock.rpc.mockResolvedValue({data:null,error:{message:'outside server radius'}})
  render(<AttendanceCard/>)
  await waitFor(()=>expect(screen.getByRole('button',{name:'Check-in'})).toBeEnabled())
  fireEvent.click(screen.getByRole('button',{name:'Check-in'}))
  await waitFor(()=>expect(mock.error).toHaveBeenCalledWith('outside server radius'))
  expect(screen.getByRole('button',{name:'Check-in'})).toBeEnabled()
})
