const spans = ['','col-span-1','col-span-2','col-span-3']
const smallSpans = ['','sm:col-span-1','sm:col-span-2','sm:col-span-3','sm:col-span-4']
const mediumSpans = ['','md:col-span-1','md:col-span-2','md:col-span-3','md:col-span-4','md:col-span-5','md:col-span-6']
const columns = ['','grid-cols-1','grid-cols-2','grid-cols-3']
const smallColumns = ['','sm:grid-cols-1','sm:grid-cols-2','sm:grid-cols-3','sm:grid-cols-4']
const mediumColumns = ['','md:grid-cols-1','md:grid-cols-2','md:grid-cols-3','md:grid-cols-4','md:grid-cols-5','md:grid-cols-6']
export function tableGroupLayout(size: number) {
  const count=Math.max(1,Math.floor(size))
  return {
    span: [spans[Math.min(count,3)],smallSpans[Math.min(count,4)],mediumSpans[Math.min(count,6)]].join(' '),
    grid: [columns[Math.min(count,3)],smallColumns[Math.min(count,4)],mediumColumns[Math.min(count,6)]].join(' '),
  }
}
