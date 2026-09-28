export type Role = 'admin' | 'cashier' | 'kitchen' | 'staff'

export const ROLE_LABEL: Record<string, string> = {
  admin: 'Quản lý',
  cashier: 'Thu ngân',
  kitchen: 'Bếp',
  staff: 'Phục vụ',
}
