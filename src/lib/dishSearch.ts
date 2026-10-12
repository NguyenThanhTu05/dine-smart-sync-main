const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim().replace(/\s+/g, ' ')

function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const next = [i]
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    row = next
  }
  return row[b.length]
}

export function matchDishName(name: string, query: string): number {
  const text = normalize(name), search = normalize(query).slice(0, 120)
  if (!search) return 0
  if (text === search) return 100
  if (text.includes(search)) return 80
  const words = text.split(' ')
  const tokens = search.split(' ')
  if (tokens.every(token => words.some(word => word.includes(token)))) return 60
  if (tokens.every(token => words.some(word => word.includes(token) || (token.length >= 3 && distance(token, word) <= (token.length >= 7 ? 2 : 1))))) return 40
  return -1
}
