import { toast as sonnerToast, type ExternalToast } from 'sonner'

type Kind = 'message' | 'success' | 'info' | 'warning' | 'error'
type Message = Parameters<typeof sonnerToast>[0]
const durations: Record<Kind, number> = { message: 4500, success: 3000, info: 4500, warning: 6000, error: 6500 }
const recent = new Map<string, { id: string | number; until: number }>()
let sequence = 0

function show(kind: Kind, message: Message, data?: ExternalToast) {
  const title = kind === 'error' && typeof message === 'string' && /^(?:TypeError: )?(?:Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.?)$/i.test(message.trim())
    ? 'Không kết nối được máy chủ. Kiểm tra Internet rồi thử lại.' : message
  const options = { duration: durations[kind], ...data }
  // Explicit IDs and interactive notices must remain independently updatable.
  if (typeof title !== 'string' || data?.id !== undefined || data?.action || data?.cancel ||
    (data?.description !== undefined && typeof data.description !== 'string')) return sonnerToast[kind](title, options)
  const now = Date.now()
  for (const [key, value] of recent) if (value.until <= now) recent.delete(key)
  const key = JSON.stringify([kind, title, data?.description ?? ''])
  const existing = recent.get(key)
  if (existing) return existing.id
  const id = sonnerToast[kind](title, {
    ...options, id: `app-notice-${++sequence}`,
    onDismiss: notice => { recent.delete(key); data?.onDismiss?.(notice) },
    onAutoClose: notice => { recent.delete(key); data?.onAutoClose?.(notice) },
  })
  if (recent.size >= 100) recent.delete(recent.keys().next().value!)
  recent.set(key, { id, until: now + Math.min(options.duration ?? durations[kind], 6500) })
  return id
}

export const toast: typeof sonnerToast = Object.assign(
  (message: Message, data?: ExternalToast) => show('message', message, data), sonnerToast, {
    message: (message: Message, data?: ExternalToast) => show('message', message, data),
    success: (message: Message, data?: ExternalToast) => show('success', message, data),
    info: (message: Message, data?: ExternalToast) => show('info', message, data),
    warning: (message: Message, data?: ExternalToast) => show('warning', message, data),
    error: (message: Message, data?: ExternalToast) => show('error', message, data),
    dismiss: (id?: string | number) => {
      for (const [key, value] of recent) if (id === undefined || value.id === id) recent.delete(key)
      return sonnerToast.dismiss(id)
    },
  },
)
