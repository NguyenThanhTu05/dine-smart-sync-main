// Keep the raw input until validation; Number('') and exponent coercion hide errors.
export function decimalInput(value: unknown, label: string, scale = 3, max = 99999999999.999, positive = false): number {
  const raw = String(value ?? '')
  if (!(scale === 0 ? /^[0-9]+$/ : new RegExp(`^[0-9]+(?:\\.[0-9]{1,${scale}})?$`)).test(raw) || raw.length > 32) {
    throw new Error(`${label}: nhập số hợp lệ, tối đa ${scale} chữ số thập phân.`)
  }
  const n = Number(raw)
  if (!Number.isFinite(n) || n > max || (positive && n <= 0)) throw new Error(`${label} ngoài giới hạn cho phép.`)
  return n
}
function hasControlCharacters(text: string, multiline = false): boolean {
  return Array.from(text).some(char => {
    const code = char.charCodeAt(0)
    return code === 127 || (code < 32 && !(multiline && [9, 10, 13].includes(code)))
  })
}
export function requiredText(value: unknown, label: string, max = 200): string {
  const text = String(value ?? '').trim()
  if (!text || text.length > max || hasControlCharacters(text)) throw new Error(`${label} không hợp lệ (1–${max} ký tự).`)
  return text
}

export function optionalText(value: unknown, label: string, max = 10000): string {
  const text = String(value ?? '').trim()
  if (text.length > max || hasControlCharacters(text, true)) throw new Error(`${label} quá dài hoặc chứa ký tự không hợp lệ.`)
  return text
}
export function phoneInput(value: unknown): string {
  const phone = optionalText(value, 'Số điện thoại', 32)
  if (phone && (!/^\+?[0-9 ().-]{5,32}$/.test(phone) || phone.replace(/\D/g, '').length < 5)) throw new Error('Số điện thoại không hợp lệ.')
  return phone
}
export function dateInput(value: unknown, label: string, futureAllowed = true): string | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const date = new Date(`${raw}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== raw) throw new Error(`${label} không hợp lệ.`)
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  if (!futureAllowed && raw > today) throw new Error(`${label} không được ở tương lai.`)
  return raw
}
export function passwordInput(value: unknown): string {
  if (typeof value !== 'string' || value.length < 6 || value.length > 128 || !value.trim() || value.includes('\u0000')) throw new Error('Mật khẩu phải có 6–128 ký tự và không được chỉ chứa khoảng trắng.')
  return value // Never trim or normalize credentials.
}
export function usernameInput(value: unknown): string {
  const name = requiredText(value, 'Tên đăng nhập', 64)
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) throw new Error('Tên đăng nhập chỉ gồm chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.')
  return name
}
export function coordinateInput(value: unknown, label: string, maximum: number): number {
  const raw = String(value ?? '')
  if (!/^-?\d+(?:\.\d+)?$/.test(raw) || !Number.isFinite(Number(raw)) || Math.abs(Number(raw)) > maximum) throw new Error(`${label} không hợp lệ.`)
  return Number(raw)
}
