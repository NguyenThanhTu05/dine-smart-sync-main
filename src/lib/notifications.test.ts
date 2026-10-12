import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { toast } from './notifications'
const mock = vi.hoisted(() => ({ send: vi.fn((_message: unknown, data?: { id?: string | number }) => data?.id ?? 'explicit'), dismiss: vi.fn() }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { message: mock.send, success: mock.send, info: mock.send, warning: mock.send, error: mock.send, dismiss: mock.dismiss }) }))
beforeEach(() => { toast.dismiss(); vi.clearAllMocks(); vi.useFakeTimers() })
afterEach(() => { toast.dismiss(); vi.useRealTimers() })

it('coalesces identical errors from multiple panels without resetting their lifetime', () => {
  const id = toast.error('Không tải được dữ liệu')
  expect(toast.error('Không tải được dữ liệu')).toBe(id)
  expect(mock.send).toHaveBeenCalledTimes(1)
  vi.advanceTimersByTime(6500)
  expect(toast.error('Không tải được dữ liệu')).not.toBe(id)
  expect(mock.send).toHaveBeenCalledTimes(2)
})
it('keeps success, error and distinct descriptions separate', () => {
  toast.success('Đã lưu')
  toast.error('Đã lưu')
  toast.error('Đã lưu', { description: 'Bàn 1' })
  toast.error('Đã lưu', { description: 'Bàn 2' })
  expect(mock.send).toHaveBeenCalledTimes(4)
})
it('preserves explicit ID updates and interactive notices', () => {
  toast.error('Lỗi', { id: 'payment' }); toast.success('Xong', { id: 'payment' })
  const data = { action: { label: 'Thử lại', onClick: vi.fn() } }
  toast.error('Lỗi', data); toast.error('Lỗi', data)
  expect(mock.send).toHaveBeenCalledTimes(4)
  expect(mock.send.mock.calls[1][1]).toMatchObject({ id: 'payment', duration: 3000 })
})
it('allows a dismissed notification to be shown again', () => {
  const id = toast.error('Lỗi')
  toast.dismiss(id)
  toast.error('Lỗi')
  expect(mock.send).toHaveBeenCalledTimes(2)
})
it('translates known transport errors without rewriting business errors', () => {
  toast.error('Failed to fetch')
  toast.error('Bàn đang được ghép nhóm.')
  expect(mock.send.mock.calls[0][0]).toBe('Không kết nối được máy chủ. Kiểm tra Internet rồi thử lại.')
  expect(mock.send.mock.calls[1][0]).toBe('Bàn đang được ghép nhóm.')
})
