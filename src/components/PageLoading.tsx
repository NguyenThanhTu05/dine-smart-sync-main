import { Skeleton } from '@/components/ui/skeleton'

export function PageLoading() {
  return <div data-page-loading role="status" aria-busy="true" aria-label="Đang tải màn hình" className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
    <span className="sr-only">Đang tải màn hình…</span>
    <Skeleton className="h-7 w-44"/>
    <Skeleton className="h-10 w-64 max-w-full"/>
    <div className="grid grid-cols-2 gap-3"><Skeleton className="h-36 rounded-xl"/><Skeleton className="h-36 rounded-xl"/></div>
    <Skeleton className="h-52 w-full rounded-xl"/>
  </div>
}
