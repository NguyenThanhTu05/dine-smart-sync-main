export class TargetSelectionError extends Error {
  constructor(public candidates: { id: string; name: string }[]) {
    super(candidates.length ? `Cần xác định đúng đối tượng bằng mã ID: ${candidates.map(x => `${x.name} (${x.id})`).join('; ')}` : 'Không tìm thấy đối tượng chính xác. Hãy cung cấp tên đầy đủ hoặc ID.')
  }
}
const normalize = (s: string) => s.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('vi').replace(/đ/g, 'd')
export function resolveTarget<T extends { id: string }>(rows: T[], match: string, labels: (row: T) => string[]): T {
  const query = typeof match === 'string' ? normalize(match) : ''
  if (!query) throw new TargetSelectionError([])
  const ids = rows.filter(row => row.id.toLowerCase() === query)
  if (ids.length === 1) return ids[0]
  const exact = rows.filter(row => labels(row).some(label => normalize(label) === query))
  if (exact.length === 1) return exact[0]
  const candidates = exact.length ? exact : rows.filter(row => labels(row).some(label => normalize(label).includes(query)))
  throw new TargetSelectionError(candidates.slice(0, 20).map(row => ({ id: row.id, name: labels(row).filter(Boolean).join(' / ') })))
}
