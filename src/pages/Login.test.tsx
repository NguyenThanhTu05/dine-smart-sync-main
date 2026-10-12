import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest'
import Login from './Login'

const mock = vi.hoisted(() => ({
  updateUser: vi.fn(), signOut: vi.fn(), from: vi.fn(),
  signIn: vi.fn(), success: vi.fn(), error: vi.fn(), recovery: true,
}))
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { updateUser: mock.updateUser, signOut: mock.signOut }, from: mock.from },
}))
vi.mock('@/contexts/authState', () => ({
  useAuth: () => ({ session: null, role: null, loading: false, isRecovery: mock.recovery, signInWithUsername: mock.signIn }),
}))
vi.mock('@/lib/notifications', () => ({ toast: { success: mock.success, error: mock.error } }))

beforeEach(() => {
  vi.clearAllMocks()
  mock.recovery = true
  mock.updateUser.mockResolvedValue({ error: null })
  mock.signOut.mockResolvedValue({ error: null })
})
afterEach(cleanup)

function recoveryForm(password = 'NewPassword123', confirmation = password) {
  render(<MemoryRouter><Login /></MemoryRouter>)
  fireEvent.change(screen.getByLabelText('Mật khẩu mới'), { target: { value: password } })
  fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu'), { target: { value: confirmation } })
  fireEvent.submit(screen.getByLabelText('Mật khẩu mới').closest('form')!)
}

describe('login and password recovery', () => {
  it('changes the Auth password without copying it to any application table', async () => {
    recoveryForm()
    await waitFor(() => expect(mock.signOut).toHaveBeenCalledTimes(1))
    expect(mock.updateUser).toHaveBeenCalledWith({ password: 'NewPassword123' })
    expect(mock.from).not.toHaveBeenCalled()
    expect(mock.success).toHaveBeenCalledWith('Đổi mật khẩu thành công!')
  })

  it('keeps the recovery form available after an Auth failure', async () => {
    mock.updateUser.mockResolvedValue({ error: { message: 'expired token' } })
    recoveryForm()
    await waitFor(() => expect(mock.error).toHaveBeenCalled())
    expect(mock.signOut).not.toHaveBeenCalled()
    expect(mock.from).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Mật khẩu mới')).toBeInTheDocument()
  })

  it('does not change Auth when the passwords do not match', () => {
    recoveryForm('NewPassword123', 'OtherPassword123')
    expect(mock.updateUser).not.toHaveBeenCalled()
    expect(mock.error).toHaveBeenCalledWith('Mật khẩu không khớp')
  })

  it('preserves the existing sign-in flow', async () => {
    mock.recovery = false
    mock.signIn.mockResolvedValue({})
    render(<MemoryRouter><Login /></MemoryRouter>)
    fireEvent.change(document.getElementById('u')!, { target: { value: 'test-user' } })
    fireEvent.change(document.getElementById('p')!, { target: { value: 'TestPassword123' } })
    fireEvent.submit(document.getElementById('u')!.closest('form')!)
    await waitFor(() => expect(mock.signIn).toHaveBeenCalledWith('test-user', 'TestPassword123'))
    expect(mock.success).toHaveBeenCalledWith('Đăng nhập thành công')
  })
})
