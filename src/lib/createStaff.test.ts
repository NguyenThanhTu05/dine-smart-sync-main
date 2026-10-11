import { expect,it,vi } from 'vitest'
import { createStaff } from '../../supabase/functions/_shared/createStaff'
const create = async () => ({data:{user:{id:'new-user'}},error:null})
it('does not report success when initialization fails and compensates only the new user', async () => {
  const remove=vi.fn().mockResolvedValue({error:null})
  await expect(createStaff(create,async()=>({error:{message:'role insert failed'}}),remove)).rejects.toThrow('role insert failed')
  expect(remove).toHaveBeenCalledWith('new-user')
})
it('reports unresolved compensation instead of silently leaving an incomplete account', async () => {
  await expect(createStaff(create,async()=>{throw new Error('database offline')},async()=>({error:{message:'auth offline'}}))).rejects.toThrow('new-user')
})
it('does not delete a successfully initialized user', async () => {
  const remove=vi.fn()
  expect(await createStaff(create,async()=>({error:null}),remove)).toBe('new-user')
  expect(remove).not.toHaveBeenCalled()
})
