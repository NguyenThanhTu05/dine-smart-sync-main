import { createContext } from 'react'
import type { NotificationCounts } from '@/lib/notificationCounts'

export const NotificationContext = createContext<(NotificationCounts & { readyError: boolean }) | null>(null)
