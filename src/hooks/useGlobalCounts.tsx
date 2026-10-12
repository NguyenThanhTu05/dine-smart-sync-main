import { useContext } from 'react'
import { NotificationContext } from '@/contexts/notificationState'

export function useGlobalCounts() {
  const counts = useContext(NotificationContext)
  if (!counts) throw new Error('NotificationProvider is required')
  return counts
}
