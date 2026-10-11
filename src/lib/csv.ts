export function csvRow(values: unknown[]) {
  return values.map(value => {
    let text = String(value ?? '')
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text
    return '"' + text.replace(/"/g, '""') + '"'
  }).join(',')
}
