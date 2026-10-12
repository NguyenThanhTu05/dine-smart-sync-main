import { act,cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest'
import { PayPanel } from './TablePanels'

const mock = vi.hoisted(() => ({
  read: vi.fn(), listener: undefined as (() => void) | undefined,
  oldReader: vi.fn(), error: vi.fn(), quote: vi.fn(), pay: vi.fn(), adjust: vi.fn(),
}))
vi.mock('@/lib/restaurantTransactions', () => ({
  quoteOrder: mock.quote, payOrder: mock.pay, adjustOrder: mock.adjust, changeItem: vi.fn(), submitOrder: vi.fn(),
  readableError: (error: Error) => error.message,
}))
vi.mock('@/lib/openOrder', () => ({ readOpenOrder: mock.read }))
vi.mock('@/lib/orderSync', () => ({
  notifyOrderChanges: vi.fn(),
  subscribeOrderChanges: (listener: () => void) => {
    mock.listener = listener
    return () => { mock.listener = undefined }
  },
}))
vi.mock('@/lib/tableGroup', () => ({
  findGroupOpenOrderId: mock.oldReader, resolvePrimaryTableId: vi.fn(), updateGroupStatus: vi.fn(),
}))
vi.mock('@/contexts/authState', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('@/hooks/useMenu', () => ({ useMenu: () => ({ items: [], categories: [] }) }))
vi.mock('@/components/ui/dialog', () => ({
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}))
vi.mock('@/components/ui/scroll-area', () => ({ ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('@/lib/notifications', () => ({ toast: { success: vi.fn(), error: mock.error } }))
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      const query = {
        select: () => query, eq: () => query,
        maybeSingle: async () => ({ data: { vat_percent: 0, service_percent: 0, global_discount_percent: 0 }, error: null }),
      }
      return query
    },
  },
}))

const table = { id: 'table', name: 'Bàn test', status: 'serving' as const, merged_group_id: null, area_id: 'area', seats: 4, sort_order: 1 }
const item = { id: 'item', name_snapshot: 'Món test', price_snapshot: 100000, quantity: 1, status: 'pending', no_cook: false }
beforeEach(() => {
  vi.clearAllMocks()
  mock.quote.mockResolvedValue({ order_id: 'order', fingerprint: 'initial', total: 100000, subtotal: 100000, service_fee: 0, vat_fee: 0, discount_percent: 0, discount_amount: 0, items: [item] })
  mock.pay.mockResolvedValue({})
  mock.adjust.mockReset().mockResolvedValue(undefined)
  mock.read.mockResolvedValue({ id: 'order', payment_method: 'qr', discount_percent: 0, order_items: [item] })
})
afterEach(cleanup)

async function openDiscount() {
  render(<PayPanel table={table} onBack={vi.fn()} onDone={vi.fn()} />)
  await waitFor(() => expect(screen.getByRole('button', { name: /Giảm giá/ })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: /Giảm giá/ }))
}

describe('discount entry', () => {
  it('accepts a typed zero percent through the existing RPC and has no preset buttons', async () => {
    await openDiscount()
    const input = screen.getByLabelText('Phần Trăm Giảm Giá:')
    expect(input).toHaveValue('0')
    expect(screen.queryByRole('button', { name: '10%' })).toBeNull()
    fireEvent.change(input, { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /Áp dụng/ }))
    await waitFor(() => expect(mock.adjust).toHaveBeenCalledWith('order', 'discount', { percent: 0 }, 'Ưu đãi khuyến mãi'))
  })
  it('shows the server total and previews a typed percentage against VAT and service included', async () => {
    mock.quote.mockResolvedValue({ fingerprint: 'fees', total: 115500, subtotal: 100000, service_fee: 5000, vat_fee: 10500, service_percent: 5, vat_percent: 10, discount_percent: 0, global_discount_percent: 0, items: [item] })
    await openDiscount()
    expect(screen.getByTestId('discount-current-total')).toHaveTextContent('115.500')
    fireEvent.change(screen.getByLabelText('Phần Trăm Giảm Giá:'), { target: { value: '10' } })
    expect(screen.getByTestId('discount-preview-total')).toHaveTextContent('103.950')
    expect(screen.getByTestId('discount-current-total')).toHaveTextContent('115.500')
    expect(screen.queryByText(/Tạm Tính Sau Giảm/i)).toBeNull()
  })
  it.each(['', ' ', '-1', '101', 'abc', '1e2', '1.1234567'])('rejects invalid input %j without calling the server', async value => {
    await openDiscount()
    fireEvent.change(screen.getByLabelText('Phần Trăm Giảm Giá:'), { target: { value } })
    expect(screen.getByRole('button', { name: /Áp dụng/ })).toBeDisabled()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(mock.adjust).not.toHaveBeenCalled()
  })
  it('keeps the input open when the server rejects the adjustment', async () => {
    mock.adjust.mockRejectedValueOnce(new Error('Không có quyền'))
    await openDiscount()
    fireEvent.change(screen.getByLabelText('Phần Trăm Giảm Giá:'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: /Áp dụng/ }))
    await waitFor(() => expect(mock.error).toHaveBeenCalledWith('❌ Lỗi: Không có quyền'))
    expect(screen.getByLabelText('Phần Trăm Giảm Giá:')).toHaveValue('10')
    expect(screen.getByRole('button', { name: /Áp dụng/ })).toBeEnabled()
  })
  it('prevents duplicate adjustments while the first request is pending', async () => {
    let finish!: () => void
    mock.adjust.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
    await openDiscount()
    const apply = screen.getByRole('button', { name: /Áp dụng/ })
    fireEvent.click(apply); fireEvent.click(apply)
    expect(mock.adjust).toHaveBeenCalledTimes(1)
    await act(async () => { finish() })
  })
})

describe('open payment panel realtime', () => {
  it('does not include a cooked item in no_cook returns when the names and prices match', async () => {
    const cooked = { ...item, id: 'cooked', menu_item_id: 'menu', quantity: 2, status: 'cooking' }
    const ready = { ...item, id: 'ready', menu_item_id: 'menu', quantity: 1, status: 'done', no_cook: true }
    mock.read.mockResolvedValue({ id: 'order', payment_method: 'qr', order_items: [cooked, ready] })
    mock.quote.mockResolvedValue({ order_id: 'order', fingerprint: 'mixed', subtotal: 300000, total: 300000, items: [cooked, ready] })
    render(<PayPanel table={table} onBack={vi.fn()} onDone={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /Trả món/ })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /Trả món/ }))
    expect(screen.getByText(/Gốc: 1 ×/)).toBeInTheDocument()
    expect(screen.queryByText(/Gốc: 3 ×/)).not.toBeInTheDocument()
  })
  it('refreshes the bill after a remote item change without resetting the selected payment method', async () => {
    render(<PayPanel table={table} onBack={vi.fn()} onDone={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/Món test ×/)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Tiền mặt' }))
    mock.read.mockResolvedValue({ id: 'order', payment_method: 'qr', discount_percent: 0, order_items: [{ ...item, quantity: 2 }] })
    mock.quote.mockResolvedValue({ fingerprint: 'updated', total: 200000, subtotal: 200000, items: [{ ...item, quantity: 2 }] })
    await act(async () => { mock.listener?.() })
    await waitFor(() => expect(screen.getAllByText(/200\.000/).length).toBeGreaterThan(0))
    expect(screen.getByRole('button', { name: /Đã nhận tiền/ })).toBeInTheDocument()
    expect(mock.oldReader).not.toHaveBeenCalled()
  })

  it('removes a remotely cancelled item from the displayed total', async () => {
    render(<PayPanel table={table} onBack={vi.fn()} onDone={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/Món test ×/)).toBeInTheDocument())
    mock.read.mockResolvedValue({ id: 'order', payment_method: 'qr', discount_percent: 0, order_items: [] })
    mock.quote.mockResolvedValue({ fingerprint: 'cancelled', total: 0, subtotal: 0, items: [] })
    await act(async () => { mock.listener?.() })
    await waitFor(() => expect(screen.queryByText(/Món test ×/)).not.toBeInTheDocument())
  })

  it('does not leave a stale bill actionable after a failed refresh', async () => {
    render(<PayPanel table={table} onBack={vi.fn()} onDone={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/Món test ×/)).toBeInTheDocument())
    mock.read.mockRejectedValue(new Error('cannot verify bill'))
    await act(async () => { mock.listener?.() })
    await waitFor(() => expect(mock.error).toHaveBeenCalledWith('cannot verify bill'))
    expect(screen.getByRole('button', { name: 'Thanh toán' })).toBeDisabled()
  })
  it('uses the displayed server fingerprint and requires another click after a stale-price rejection', async () => {
    const done = vi.fn()
    render(<PayPanel table={table} onBack={vi.fn()} onDone={done} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Thanh toán' })).toBeEnabled())
    mock.pay.mockRejectedValueOnce(new Error('Hóa đơn vừa thay đổi'))
    mock.quote.mockResolvedValue({ fingerprint: 'fresh', total: 115000, subtotal: 100000, items: [item] })
    fireEvent.click(screen.getByRole('button', { name: 'Thanh toán' }))
    await waitFor(() => expect(mock.error).toHaveBeenCalledWith('Hóa đơn vừa thay đổi'))
    await waitFor(() => expect(screen.getAllByText(/115\.000/).length).toBeGreaterThan(0))
    expect(mock.pay).toHaveBeenCalledTimes(1)
    expect(mock.pay).toHaveBeenCalledWith('order', 'request_qr', 'initial')
    expect(done).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Thanh toán' }))
    await waitFor(() => expect(mock.pay).toHaveBeenLastCalledWith('order', 'request_qr', 'fresh'))
  })

  it('does not fall back to a client payment when the quote RPC is missing', async () => {
    mock.quote.mockRejectedValue(new Error('RPC missing'))
    render(<PayPanel table={table} onBack={vi.fn()} onDone={vi.fn()} />)
    await waitFor(() => expect(mock.error).toHaveBeenCalledWith('RPC missing'))
    expect(screen.getByRole('button', { name: 'Thanh toán' })).toBeDisabled()
    expect(mock.pay).not.toHaveBeenCalled()
  })

  it('prevents repeated clicks while a cash confirmation is pending', async () => {
    let resolvePayment: (() => void) | undefined
    mock.pay.mockImplementation(() => new Promise<void>(resolve => { resolvePayment = resolve }))
    render(<PayPanel table={table} onBack={vi.fn()} onDone={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Thanh toán' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Tiền mặt' }))
    const confirm = screen.getByRole('button', { name: /Đã nhận tiền/ })
    fireEvent.click(confirm); fireEvent.click(confirm)
    expect(mock.pay).toHaveBeenCalledTimes(1)
    expect(mock.pay).toHaveBeenCalledWith('order', 'confirm_cash', 'initial')
    await act(async () => { resolvePayment?.() })
  })

})
