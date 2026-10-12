import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { NumberBadge } from './NumberBadge'
afterEach(cleanup)
it('anchors the orange notification badge over the upper-right border', () => {
  render(<NumberBadge n={4} />)
  const badge = screen.getByLabelText('4 thông báo')
  expect(badge).toHaveClass('absolute', 'top-0', 'right-0', 'translate-x-1/3', '-translate-y-1/3', 'bg-orange-500')
})
it('caps display at 99+ but exposes the actual quantity accessibly', () => {
  render(<NumberBadge n={120} label="120 món chờ bê" />)
  expect(screen.getByLabelText('120 món chờ bê')).toHaveTextContent('99+')
})
