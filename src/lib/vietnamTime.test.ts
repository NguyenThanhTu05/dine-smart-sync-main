import { expect,it } from 'vitest'
import { vietnamDayKey,vietnamDayRange,vietnamParts,vietnamPeriodRange } from '../../supabase/functions/_shared/vietnamTime'
it('handles the Vietnam midnight independently of the device timezone', () => {
  expect(vietnamDayKey(new Date('2026-10-09T16:59:59Z'))).toBe('2026-10-09')
  expect(vietnamDayRange(new Date('2026-10-09T17:00:00Z'))).toEqual({start:'2026-10-09T17:00:00.000Z',end:'2026-10-10T17:00:00.000Z'})
})
it('uses exclusive month/year boundaries and Vietnam chart buckets',()=>{
  expect(vietnamPeriodRange(new Date(2026,9,9),'month')).toEqual({start:'2026-09-30T17:00:00.000Z',end:'2026-10-31T17:00:00.000Z'})
  expect(vietnamPeriodRange(new Date(2026,9,9),'year')).toEqual({start:'2025-12-31T17:00:00.000Z',end:'2026-12-31T17:00:00.000Z'})
  expect(vietnamParts('2026-10-09T17:00:00Z')).toMatchObject({hour:0,date:10,month:9})
})
