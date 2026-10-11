import { expect,it } from 'vitest'
import { resolveTarget,TargetSelectionError } from '../../supabase/functions/_shared/resolveTarget'
const rows = [{id:'a',name:'Bàn 1'}, {id:'b',name:'Bàn 10'}, {id:'c',name:'Thịt bò'}, {id:'d',name:'Thịt bò'}]
it('uses a unique full name or explicit ID, never the first partial match', () => {
  expect(resolveTarget(rows,'Bàn 1',r=>[r.name]).id).toBe('a')
  expect(resolveTarget(rows,'d',r=>[r.name]).id).toBe('d')
  expect(() => resolveTarget(rows,'Bàn',r=>[r.name])).toThrow(TargetSelectionError)
  expect(() => resolveTarget(rows,'Thịt bò',r=>[r.name])).toThrow(TargetSelectionError)
  expect(() => resolveTarget(rows,' ',r=>[r.name])).toThrow(TargetSelectionError)
})
