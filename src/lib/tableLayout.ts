const spans = ['', 'col-span-1', 'col-span-2', 'col-span-3', 'col-span-4', 'col-span-5', 'col-span-6']

export type TableCluster<T> =
  | { kind: 'single'; table: T }
  | { kind: 'group'; groupId: string; tables: T[] }

// Groups occupy their first member's slot. The source order is never changed or persisted.
export function clusterTables<T extends { merged_group_id: string | null }>(tables: readonly T[]): TableCluster<T>[] {
  const clusters: TableCluster<T>[] = []
  const groups = new Map<string, Extract<TableCluster<T>, { kind: 'group' }>>()
  for (const table of tables) {
    if (!table.merged_group_id) {
      clusters.push({ kind: 'single', table })
      continue
    }
    let group = groups.get(table.merged_group_id)
    if (!group) {
      group = { kind: 'group', groupId: table.merged_group_id, tables: [] }
      groups.set(table.merged_group_id, group)
      clusters.push(group)
    }
    group.tables.push(table)
  }
  return clusters
}

// Show a cross-area group once, in its first area in the existing area order.
export function tableClustersByArea<T extends { area_id: string | null; merged_group_id: string | null }>(tables: readonly T[], areaIds: readonly string[]) {
  const known = new Set(areaIds)
  const ordered = [...areaIds.flatMap(id => tables.filter(table => table.area_id === id)),
    ...tables.filter(table => !table.area_id || !known.has(table.area_id))]
  const result: Record<string, TableCluster<T>[]> = Object.fromEntries(areaIds.map(id => [id, []]))
  for (const cluster of clusterTables(ordered)) {
    const host = cluster.kind === 'single' ? cluster.table.area_id : cluster.tables[0].area_id
    if (host && known.has(host)) result[host].push(cluster)
  }
  return result
}

export function tableGroupLayout(size: number, availableColumns: 3 | 6 = 6) {
  const count = Math.max(1, Math.floor(size))
  const rowCount = Math.ceil(count / availableColumns)
  const columns = Math.ceil(count / rowCount)
  const perRow = Math.floor(count / rowCount)
  const extra = count % rowCount
  return {
    span: spans[columns], columns,
    rows: Array.from({ length: rowCount }, (_, index) => perRow + (index < extra ? 1 : 0)),
  }
}
