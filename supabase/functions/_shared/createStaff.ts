// Auth is a separate service: compensate only the newly created account if
// the database transaction fails, and expose failed compensation for recovery.
export async function createStaff(
  create: () => Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }>,
  initialize: (id: string) => PromiseLike<{ error: { message: string } | null }>,
  remove: (id: string) => Promise<{ error: { message: string } | null }>,
) {
  const created = await create()
  if (created.error) throw new Error(created.error.message)
  const id = created.data.user?.id
  if (!id) throw new Error('Dịch vụ tài khoản không trả về ID nhân viên')
  try {
    const result = await initialize(id)
    if (result.error) throw new Error(result.error.message)
    return id
  } catch (error) {
    try {
      const rollback = await remove(id)
      if (rollback.error) throw new Error(rollback.error.message)
    } catch {
      throw new Error(`Thiết lập thất bại, chưa thể thu hồi tài khoản mới ${id}. Cần quản trị viên kiểm tra trước khi thử lại.`)
    }
    throw error
  }
}
