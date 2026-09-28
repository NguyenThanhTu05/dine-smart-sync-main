import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/integrations/supabase/client'
import { Navigate } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ChefHat, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export default function Login() {
  const { session, role, loading, isRecovery, signInWithUsername } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
const [forgotOpen, setForgotOpen] = useState(false)
const [forgotUsername, setForgotUsername] = useState('')
const [forgotStep, setForgotStep] = useState<'input' | 'admin-otp' | 'staff-notice'>('input')
const [forgotLoading, setForgotLoading] = useState(false)
const [otpValue, setOtpValue] = useState('')
const [newPassword, setNewPassword] = useState('')
const [adminEmail, setAdminEmail] = useState('')
const [countdown, setCountdown] = useState(0)
const [confirmPassword, setConfirmPassword] = useState('')
const [showPassword, setShowPassword] = useState(false)
const [showConfirmPassword, setShowConfirmPassword] = useState(false)


  useEffect(() => {
  if (isRecovery) {
    setForgotOpen(true)
    setForgotStep('admin-otp')
  }
}, [isRecovery])

if (loading) return <div className="grid h-full place-items-center"><Loader2 className="animate-spin"/></div>
if (session && role && !isRecovery) return <Navigate to={`/${role}`} replace />

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) return
    setSubmitting(true)
    const { error } = await signInWithUsername(username, password)
    setSubmitting(false)
    if (error) toast.error(error)
    else toast.success('Đăng nhập thành công')
  }

  const onForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const raw = forgotUsername.trim().toLowerCase()
    const hasAt = raw.includes('@')

    // Nếu có @ nhưng không phải @gmail.com → báo lỗi luôn
    if (hasAt && !raw.endsWith('@gmail.com')) {
      toast.error('Vui lòng nhập đúng định dạng @gmail.com')
      return
    }

    const usernameToSearch = hasAt ? raw.split('@')[0] : raw
    setForgotLoading(true)

    const { data: roleResult, error: rpcError } = await supabase
      .rpc('get_role_by_username', { p_username: usernameToSearch })

    setForgotLoading(false)

    if (rpcError || !roleResult) {
      toast.error('Tên đăng nhập không tồn tại trong hệ thống')
      return
    }

    // Tài khoản phụ nhưng nhập kèm @gmail.com
    if (hasAt && roleResult !== 'admin') {
      toast.error('Tên đăng nhập không tồn tại trong hệ thống')
      return
    }

    if (roleResult === 'admin') {
      const email = raw.includes('@') ? raw : `${raw}@gmail.com`
      setAdminEmail(email)
      setForgotStep('admin-otp')
    } else {
      setForgotStep('staff-notice')
    }
  }

 const sendOtp = async () => {
    const { error } = await supabase.auth.resetPasswordForEmail(adminEmail)
    if (error) {
      toast.error('Không thể gửi mã, thử lại sau')
      return
    }
    toast.success('Đã gửi mã OTP về Gmail của bạn')
    setCountdown(60)
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(timer); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  const onVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
   setForgotLoading(true)
    const { error } = await supabase.auth.verifyOtp({
      email: adminEmail,
      token: otpValue,
      type: 'recovery'
    })
    setForgotLoading(false)
   if (error) {
      toast.error('Mã xác nhận không đúng hoặc đã hết hạn')
      return
    }
  }

  const onResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword.length < 6) {
      toast.error('Mật khẩu phải có ít nhất 6 ký tự')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('Mật khẩu không khớp')
      return
    }
    setForgotLoading(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setForgotLoading(false)
    if (error) {
      toast.error('Không thể đổi mật khẩu, thử lại sau')
      return
    }
    await supabase
      .from('profiles')
      .update({ visible_password: newPassword })
      .eq('id', (await supabase.auth.getUser()).data.user?.id ?? '')

    toast.success('Đổi mật khẩu thành công!')
    await supabase.auth.signOut()
    resetForgot()
  }

 const resetForgot = () => {
    setForgotOpen(false)
    setForgotUsername('')
    setForgotStep('input')
    setOtpValue('')
    setNewPassword('')
    setAdminEmail('')
    setCountdown(0)
    setConfirmPassword('')
    setShowPassword(false)
  }
  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-secondary/40 via-background to-background p-4">
      <Card className="w-full max-w-md p-8 shadow-soft">
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-soft">
            <ChefHat className="h-8 w-8" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold">Quản lý Nhà hàng</h1>
            <p className="text-sm text-muted-foreground">Đăng nhập để bắt đầu ca làm</p>
          </div>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="u">Tên đăng nhập</Label>
            <Input id="u" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Nhập tên đăng nhập" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p">Mật khẩu</Label>
            <Input id="p" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Nhập mật khẩu" />
          </div>
          <Button type="submit" disabled={submitting} className="h-11 w-full text-base font-semibold">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Đăng nhập'}
          </Button>
          <p className="pt-2 text-center text-xs text-muted-foreground">
            Quên mật khẩu?{' '}
            <button
              type="button"
              onClick={() => setForgotOpen(true)}
              className="underline underline-offset-2 hover:text-foreground transition-colors"
            >
              Liên hệ hỗ trợ
            </button>
          </p>
        </form>
      </Card>
    {forgotOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <Card className="w-full max-w-sm p-6 shadow-soft">

            {forgotStep === 'input' && (
              <>
                <h2 className="mb-1 text-lg font-semibold">Quên mật khẩu</h2>
                <p className="mb-4 text-sm text-muted-foreground">Nhập tên đăng nhập để xác nhận</p>
                <form onSubmit={onForgotSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="forgot-u">Tên đăng nhập</Label>
                    <Input
                      id="forgot-u"
                      autoFocus
                      value={forgotUsername}
                      onChange={(e) => setForgotUsername(e.target.value)}
                      placeholder="Tên đăng nhập hoặc email"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" className="flex-1" onClick={resetForgot}>
                      Huỷ
                    </Button>
                    <Button type="submit" className="flex-1" disabled={!forgotUsername.trim() || forgotLoading}>
                      {forgotLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Xác nhận'}
                    </Button>
                  </div>
                </form>
              </>
            )}

            {forgotStep === 'admin-otp' && !isRecovery && (
              <>
                <h2 className="mb-1 text-lg font-semibold">Xác nhận qua Gmail</h2>
                <p className="mb-4 text-sm text-muted-foreground">
                  Nhấn gửi mã để nhận OTP về <span className="font-medium text-foreground">{adminEmail}</span>
                </p>
                <form onSubmit={onVerifyOtp} className="space-y-4">
                  <Button type="button" variant="outline" className="w-full" onClick={sendOtp} disabled={countdown > 0}>
                    {countdown > 0 ? `Gửi lại sau ${countdown}s` : 'Gửi mã OTP'}
                  </Button>
                  <div className="space-y-1.5">
                    <Label htmlFor="otp">Mã xác nhận</Label>
                    <Input
                      id="otp"
                      placeholder="Nhập mã 6 số"
                      maxLength={6}
                      value={otpValue}
                      onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, ''))}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" className="flex-1" onClick={resetForgot}>
                      Huỷ
                    </Button>
                    <Button type="submit" className="flex-1" disabled={otpValue.length !== 6 || forgotLoading}>
                      {forgotLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Xác nhận'}
                    </Button>
                  </div>
                </form>
              </>
            )}

           {forgotStep === 'admin-otp' && isRecovery && (
              <>
                <h2 className="mb-1 text-lg font-semibold">Đặt mật khẩu mới</h2>
                <p className="mb-4 text-sm text-muted-foreground">Nhập mật khẩu mới cho tài khoản quản lý</p>
                <form onSubmit={onResetPassword} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="new-pw">Mật khẩu mới</Label>
                    <div className="relative">
                      <Input
                        id="new-pw"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Ít nhất 6 ký tự"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? '😳' : '🫣'}
                      </button>
                    </div>
                  </div>
                 <div className="space-y-1.5">
                    <Label htmlFor="confirm-pw">Xác nhận mật khẩu</Label>
                    <div className="relative">
                      <Input
                        id="confirm-pw"
                        type={showConfirmPassword ? 'text' : 'password'}
                        placeholder="Nhập lại mật khẩu"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showConfirmPassword ? '😳' : '🫣'}
                      </button>
                    </div>
                    {confirmPassword && newPassword !== confirmPassword && (
                      <p className="text-xs text-destructive">Mật khẩu không khớp</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" className="flex-1" onClick={async () => { await supabase.auth.signOut(); resetForgot() }}>
                      Huỷ
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1"
                      disabled={!newPassword || !confirmPassword || newPassword !== confirmPassword || forgotLoading}
                    >
                      {forgotLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Lưu mật khẩu'}
                    </Button>
                  </div>
                </form>
              </>
            )}

            {forgotStep === 'staff-notice' && (
              <>
                <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-orange-100 text-orange-600">
                  <ChefHat className="h-6 w-6" />
                </div>
                <h2 className="mb-1 text-lg font-semibold">Liên hệ Quản lý</h2>
                <p className="mb-4 text-sm text-muted-foreground">
                  Tài khoản <span className="font-medium text-foreground">{forgotUsername}</span> không thể tự đặt lại mật khẩu.
                  Vui lòng liên hệ Quản lý để được cấp mật khẩu mới.
                </p>
                <Button className="w-full" onClick={resetForgot}>Đã hiểu</Button>
              </>
            )}

          </Card>
        </div>
      )}
    </div>
  )
}
