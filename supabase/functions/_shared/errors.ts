export function errorMessage(error: unknown, fallback = 'Thao tác thất bại'): string {
  if (error instanceof Error) return error.message || fallback
  if (error && typeof error==='object' && 'message' in error && typeof error.message==='string') return error.message || fallback
  return fallback
}
