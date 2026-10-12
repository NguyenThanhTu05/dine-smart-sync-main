import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach,beforeEach,expect,it,vi } from 'vitest'
import { AttendanceCard } from './AttendanceCard'
const mock=vi.hoisted(()=>({rpc:vi.fn(),position:vi.fn(),permission:vi.fn(),error:vi.fn()}))
vi.mock('@/contexts/authState',()=>({useAuth:()=>({user:{id:'staff'}})}))
vi.mock('@/lib/geo',()=>({getCurrentPosition:mock.position,getLocationPermission:mock.permission,getLocationDiagnostic:()=>null,haversineMeters:()=>0}))
vi.mock('@/lib/notifications',()=>({toast:{error:mock.error,success:vi.fn()}}))
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
  mock.permission.mockResolvedValue('granted')
  mock.position.mockResolvedValueOnce({coords:{latitude:10,longitude:106}}).mockResolvedValue({coords:{latitude:10.0001,longitude:106.0001}})
})
afterEach(()=>{ cleanup(); vi.unstubAllGlobals() })
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
it('ignores an old GPS failure after leaving and reopening the card',async()=>{
  let failOld: (error: Error) => void = () => {}
  mock.position.mockReset().mockImplementationOnce(()=>new Promise((_resolve,reject)=>{failOld=reject}))
    .mockResolvedValue({coords:{latitude:10,longitude:106}})
  const first=render(<AttendanceCard/>)
  await waitFor(()=>expect(mock.position).toHaveBeenCalledTimes(1))
  first.unmount()
  render(<StrictMode><AttendanceCard/></StrictMode>)
  await waitFor(()=>expect(screen.getByRole('button',{name:'Check-in'})).toBeEnabled())
  failOld(new Error('old GPS timeout'))
  await waitFor(()=>expect(screen.getByRole('button',{name:'Check-in'})).toBeEnabled())
  expect(mock.error).not.toHaveBeenCalled()
})
it('disables attendance when refreshing GPS fails instead of using a stale fix',async()=>{
  render(<AttendanceCard/>)
  await waitFor(()=>expect(screen.getByRole('button',{name:'Check-in'})).toBeEnabled())
  mock.position.mockRejectedValueOnce(new Error('GPS unavailable'))
  fireEvent.click(screen.getByRole('button',{name:'Cập nhật vị trí'}))
  await waitFor(()=>expect(mock.error).toHaveBeenCalledWith('GPS unavailable'))
  expect(screen.getByRole('button',{name:'Check-in'})).toBeDisabled()
})

it('waits for a user action before requesting a permission that needs a prompt',async()=>{
  mock.permission.mockResolvedValue('prompt')
  render(<AttendanceCard/>)
  await screen.findByText('Nhấn Cập nhật vị trí để cho phép truy cập GPS.')
  expect(mock.position).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'Cập nhật vị trí'}))
  await waitFor(()=>expect(screen.getByRole('button',{name:'Check-in'})).toBeEnabled())
  expect(mock.position).toHaveBeenCalledTimes(1)
})

it('recovers on returning to the page after an automatic GPS failure',async()=>{
  mock.position.mockReset().mockRejectedValueOnce(new Error('GPS not ready'))
    .mockResolvedValue({coords:{latitude:10,longitude:106}})
  render(<AttendanceCard/>)
  await screen.findByText('GPS not ready')
  expect(mock.error).not.toHaveBeenCalled()
  fireEvent.focus(window)
  await waitFor(()=>expect(screen.getByRole('button',{name:'Check-in'})).toBeEnabled())
  expect(mock.position).toHaveBeenCalledTimes(2)
})

it('does not issue overlapping GPS requests when focus events arrive together',async()=>{
  let finish: (position: unknown) => void = () => {}
  mock.position.mockReset().mockImplementation(()=>new Promise(resolve=>{finish=resolve}))
  render(<AttendanceCard/>)
  await waitFor(()=>expect(mock.position).toHaveBeenCalledTimes(1))
  fireEvent.focus(window)
  fireEvent.focus(window)
  expect(mock.position).toHaveBeenCalledTimes(1)
  finish({coords:{latitude:10,longitude:106}})
  await waitFor(()=>expect(screen.getByRole('button',{name:'Check-in'})).toBeEnabled())
})

it('refreshes after permission is granted and removes the permission listener on unmount',async()=>{
  const status = new EventTarget()
  vi.stubGlobal('navigator', { permissions: { query: vi.fn().mockResolvedValue(status) } })
  mock.permission.mockResolvedValue('prompt')
  const view=render(<AttendanceCard/>)
  await screen.findByText('Nhấn Cập nhật vị trí để cho phép truy cập GPS.')
  mock.permission.mockResolvedValue('granted')
  status.dispatchEvent(new Event('change'))
  await waitFor(()=>expect(screen.getByRole('button',{name:'Check-in'})).toBeEnabled())
  view.unmount()
  const requests=mock.permission.mock.calls.length
  status.dispatchEvent(new Event('change'))
  expect(mock.permission).toHaveBeenCalledTimes(requests)
})
