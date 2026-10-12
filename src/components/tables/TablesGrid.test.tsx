import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { HTMLAttributes, ReactNode } from 'react'
import type { RestaurantTable } from '@/hooks/useTables'
import { TablesGrid } from './TablesGrid'
const mock = vi.hoisted(() => ({ mobile: true, ready: {} as Record<string, number>, tables: [] as RestaurantTable[], areas: [{ id: 'area', name: 'Khu A' }] }))
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => mock.mobile }))
vi.mock('@/hooks/useGlobalCounts', () => ({ useGlobalCounts: () => ({ readyByTable: mock.ready, readyError: false }) }))
vi.mock('@/hooks/useTables', async original => ({ ...await original<typeof import('@/hooks/useTables')>(), useTables: () => ({ tables: mock.tables, areas: mock.areas, loading: false, reload: vi.fn() }) }))
vi.mock('@/components/tables/TouchTableDrag', () => ({
  TouchTableDnd: ({ children }: { children: ReactNode }) => <>{children}</>,
  TouchTableSurface: ({ children, tableId, className, onClick }: HTMLAttributes<HTMLDivElement> & { tableId: string }) => <div data-table-id={tableId} className={className} onClick={onClick}>{children}</div>,
}))
const table = (id: string, group: string | null = null): RestaurantTable => ({ id, name: `Bàn ${id}`, area_id: 'area', seats: 4, sort_order: 1, status: 'serving', merged_group_id: group })
beforeEach(() => { mock.mobile = true; mock.ready = {}; mock.areas = [{ id: 'area', name: 'Khu A' }]; mock.tables = [table('1', 'g'), table('2'), table('3'), table('4'), table('5', 'g'), table('6')] })
afterEach(cleanup)

it.each([true, false])('shows a cross-area group once, with origin labels and one ready badge (mobile=%s)', mobile => {
  mock.mobile = mobile
  mock.areas.push({ id: 'other', name: 'Khu B' })
  mock.tables[4].area_id = 'other'
  mock.ready = { '1': 2, '5': 3 }
  const { container } = render(<TablesGrid onSelectTable={vi.fn()} />)
  expect(container.querySelectorAll('[data-table-group="g"]')).toHaveLength(1)
  const group = container.querySelector('[data-table-group="g"]')!
  expect(group.querySelectorAll('[data-table-id]')).toHaveLength(2)
  expect(group).toHaveTextContent('Khu A')
  expect(group).toHaveTextContent('Khu B')
  expect(screen.getAllByLabelText('5 món chờ bê của nhóm Bàn 1, Bàn 5')).toHaveLength(1)
  expect(screen.getByText('Bàn 5 đang ghép tại Khu A.')).toBeInTheDocument()
})

it('groups distant members in three mobile columns and restores their original slots after splitting', () => {
  const original = mock.tables.map(table => ({ ...table }))
  const view = render(<TablesGrid onSelectTable={vi.fn()} />)
  const ids = () => [...view.container.querySelectorAll('[data-table-id]')].map(element => element.getAttribute('data-table-id'))
  expect(ids()).toEqual(['1', '5', '2', '3', '4', '6'])
  expect(view.container.querySelector('section > .grid')).toHaveClass('grid-cols-3')
  expect(view.container.querySelector('[data-table-group="g"]')).toHaveClass('col-span-2', 'ring-2', 'ring-primary')
  expect(mock.tables).toEqual(original)
  mock.tables = mock.tables.map(table => ({ ...table, merged_group_id: null }))
  view.rerender(<TablesGrid onSelectTable={vi.fn()} />)
  expect(ids()).toEqual(['1', '2', '3', '4', '5', '6'])
  expect(view.container.querySelector('[data-table-group]')).toBeNull()
})
it('shows orange ready quantity over the upper-right border and preserves table selection', () => {
  mock.ready = { '2': 3 }
  const select = vi.fn()
  render(<TablesGrid onSelectTable={select} />)
  const badge = screen.getByLabelText('3 món chờ bê tại Bàn 2')
  expect(badge).toHaveClass('bg-orange-500', 'top-0', 'right-0', 'translate-x-1/3', '-translate-y-1/3')
  fireEvent.click(badge)
  expect(select).toHaveBeenCalledWith(expect.objectContaining({ id: '2' }))
})
it('uses shared group quantities and removes the badge after all dishes are served', () => {
  mock.ready = { '1': 2, '5': 1 }
  const view = render(<TablesGrid onSelectTable={vi.fn()} />)
  expect(screen.getAllByLabelText('3 món chờ bê của nhóm Bàn 1, Bàn 5')).toHaveLength(1)
  mock.ready = {}; view.rerender(<TablesGrid onSelectTable={vi.fn()} />)
  expect(screen.queryByLabelText(/món chờ bê/)).toBeNull()
})
it('keeps desktop groups joined with one shared badge', () => {
  mock.mobile = false; mock.ready = { '1': 2 }
  render(<TablesGrid onSelectTable={vi.fn()} />)
  expect(screen.getAllByLabelText(/2 món chờ bê/)).toHaveLength(1)
  expect(screen.getByLabelText(/2 món chờ bê/).parentElement).not.toHaveClass('overflow-hidden')
})
it('joins vertical and horizontal members into one compact block with no rounded internal corners', () => {
  mock.tables = [table('1', 'g'), table('2'), table('3', 'g'), table('4'), table('5', 'g'), table('6', 'g')]
  const select = vi.fn()
  const { container } = render(<TablesGrid onSelectTable={select} />)
  const group = container.querySelector<HTMLElement>('[data-table-group="g"]')!
  expect(group).toHaveStyle({ gridRow: 'span 2' })
  const rows = [...group.querySelectorAll('[data-group-row]')]
  expect(rows).toHaveLength(2)
  expect(rows.map(row => row.querySelectorAll('[data-table-id]').length)).toEqual([2, 2])
  expect([...group.querySelectorAll('[data-table-id]')].every(cell => cell.className.includes('rounded-none') && cell.className.includes('aspect-auto'))).toBe(true)
  fireEvent.click(group.querySelector('[data-table-id="6"]')!)
  expect(select).toHaveBeenCalledWith(expect.objectContaining({ id: '6', merged_group_id: 'g' }))
})
it('keeps groups separate and uses balanced rows for larger groups', () => {
  mock.tables = Array.from({ length: 7 }, (_, index) => table(String(index + 1), 'g'))
  mock.tables.push(table('8', 'other'))
  const { container } = render(<TablesGrid onSelectTable={vi.fn()} />)
  expect(container.querySelectorAll('[data-table-group]')).toHaveLength(2)
  const group = container.querySelector('[data-table-group="g"]')!
  expect([...group.querySelectorAll('[data-group-row]')].map(row => row.querySelectorAll('[data-table-id]').length)).toEqual([3, 2, 2])
  expect(group.querySelector('[data-table-id="8"]')).toBeNull()
})
it('does not show a ready badge on an empty or paid/cleanup table', () => {
  mock.tables[1].status = 'needs_cleanup'; mock.ready = { '2': 3 }
  render(<TablesGrid onSelectTable={vi.fn()} />)
  expect(screen.queryByLabelText('3 món chờ bê tại Bàn 2')).toBeNull()
})
