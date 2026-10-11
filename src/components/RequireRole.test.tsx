import { cleanup,render,screen } from '@testing-library/react'
import { MemoryRouter,Route,Routes } from 'react-router-dom'
import { afterEach,expect,it,vi } from 'vitest'
import { RequireRole } from './RequireRole'
const state=vi.hoisted(()=>({session:{} as object|null,role:'staff' as string|null,loading:false,isRecovery:false}))
vi.mock('@/contexts/authState',()=>({useAuth:()=>state}))
afterEach(cleanup)
it.each(['staff','kitchen','cashier','admin'])('allows only the matching %s role',role=>{
  Object.assign(state,{session:{},role,loading:false,isRecovery:false})
  render(<MemoryRouter initialEntries={['/protected']}><Routes><Route path="/protected" element={<RequireRole role="admin"><div>protected data</div></RequireRole>}/><Route path="*" element={<div>redirected</div>}/></Routes></MemoryRouter>)
  expect(screen.getByText(role==='admin'?'protected data':'redirected')).toBeInTheDocument()
})
it.each([{session:null,role:null,isRecovery:false},{session:{},role:'admin',isRecovery:true},{session:{},role:null,isRecovery:false}])('blocks unauthenticated, recovery and unresolved privileges',patch=>{
  Object.assign(state,{loading:false},patch)
  render(<MemoryRouter initialEntries={['/protected']}><Routes><Route path="/protected" element={<RequireRole role="admin"><div>protected data</div></RequireRole>}/><Route path="*" element={<div>redirected</div>}/></Routes></MemoryRouter>)
  expect(screen.getByText('redirected')).toBeInTheDocument()
})
