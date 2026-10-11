import { expect,it } from 'vitest'
import { csvRow } from './csv'
it('escapes commas, quotes, newlines and spreadsheet formulas',()=>{
  expect(csvRow(['A, B','C"D','E\nF','=1+1',null])).toBe('"A, B","C""D","E\nF","\'=1+1",""')
})
