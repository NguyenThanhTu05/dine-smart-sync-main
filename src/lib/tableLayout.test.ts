import { describe, expect, it } from 'vitest'
import { clusterTables, tableClustersByArea, tableGroupLayout } from './tableLayout'

describe('compact merged table layout', () => {
  it.each([3, 6] as const)('fits %i columns without isolated final rows or dropping tables', columns => {
    for (let size = 1; size <= 50; size++) {
      const layout = tableGroupLayout(size, columns)
      expect(layout.columns).toBeLessThanOrEqual(columns)
      expect(layout.rows.reduce((sum, row) => sum + row, 0)).toBe(size)
      expect(Math.max(...layout.rows) - Math.min(...layout.rows)).toBeLessThanOrEqual(1)
      if (size > columns) expect(Math.min(...layout.rows)).toBeGreaterThan(1)
      expect(layout.span).toBe(`col-span-${layout.columns}`)
    }
  })
  it('packs four mobile tables as two rows of two', () => {
    expect(tableGroupLayout(4, 3)).toEqual({ columns: 2, rows: [2, 2], span: 'col-span-2' })
  })
  it('balances large phone and desktop groups', () => {
    expect(tableGroupLayout(7, 3).rows).toEqual([3, 2, 2])
    expect(tableGroupLayout(7, 6).rows).toEqual([4, 3])
    expect(tableGroupLayout(5, 3).rows).toEqual([3, 2])
  })
})

describe('display-only table grouping', () => {
  it('places a cross-area group once and restores its members to each original area on split', () => {
    const tables = [
      { id: 'c1', area_id: 'C', merged_group_id: 'g' },
      { id: 'b1', area_id: 'B', merged_group_id: 'g' },
      { id: 'b2', area_id: 'B', merged_group_id: null },
      { id: 'c2', area_id: 'C', merged_group_id: null },
    ]
    const grouped = tableClustersByArea(tables, ['B', 'C'])
    expect(grouped.B[0]).toMatchObject({ kind: 'group', tables: [{ id: 'b1' }, { id: 'c1' }] })
    expect(grouped.C).toEqual([{ kind: 'single', table: tables[3] }])
    const split = tableClustersByArea(tables.map(table => ({ ...table, merged_group_id: null })), ['B', 'C'])
    expect(split.B.map(cluster => cluster.kind === 'single' && cluster.table.id)).toEqual(['b1', 'b2'])
    expect(split.C.map(cluster => cluster.kind === 'single' && cluster.table.id)).toEqual(['c1', 'c2'])
    expect(tables.map(table => table.area_id)).toEqual(['C', 'B', 'B', 'C'])
  })
  it('collects distant members at the first member without mutating source order', () => {
    const tables = Object.freeze([
      Object.freeze({ id: '1', sort_order: 1, merged_group_id: 'g' }),
      Object.freeze({ id: '2', sort_order: 2, merged_group_id: null }),
      Object.freeze({ id: '3', sort_order: 3, merged_group_id: 'other' }),
      Object.freeze({ id: '4', sort_order: 4, merged_group_id: 'g' }),
    ])
    const clusters = clusterTables(tables)
    expect(clusters.map(cluster => cluster.kind === 'single' ? cluster.table.id : cluster.tables.map(table => table.id))).toEqual([['1', '4'], '2', ['3']])
    expect(tables.map(table => table.sort_order)).toEqual([1, 2, 3, 4])
    const split = clusterTables(tables.map(table => ({ ...table, merged_group_id: null })))
    expect(split.map(cluster => cluster.kind === 'single' && cluster.table.id)).toEqual(['1', '2', '3', '4'])
  })
})
