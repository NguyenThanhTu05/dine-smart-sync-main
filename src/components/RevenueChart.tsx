import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useId } from 'react'
import { formatVND } from '@/lib/formatVND'

type Point = { dateLabel: string; revenue: number | null; orders: number }

export function RevenueChart({ series, orders }: { series: Point[]; orders: number }) {
  const gradient = useId().replace(/:/g, '')
  const zeroRevenue = series.every(point => point.revenue === null || point.revenue === 0)
  return <div className="min-w-0">
    <p className="mb-3 text-xs text-muted-foreground">{orders === 0 ? 'Chưa có hóa đơn trong kỳ · Doanh thu 0 ₫' : 'Doanh thu (₫) · Chạm hoặc rê lên biểu đồ để xem chi tiết'}</p>
    <div className="h-60 sm:h-72" role="img" aria-label="Biểu đồ doanh thu theo thời gian. Chi tiết từng mốc hiển thị khi chạm hoặc rê lên biểu đồ.">
      <ResponsiveContainer width="100%" height="100%" debounce={80}>
        <AreaChart data={series} margin={{ top: 12, right: 14, left: 0, bottom: 4 }}>
          <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={.18}/>
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={.01}/>
          </linearGradient></defs>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 6"/>
          <XAxis dataKey="dateLabel" interval="preserveStartEnd" minTickGap={36} tickMargin={12} tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))"/>
          <YAxis width={48} tickCount={4} allowDecimals={false} domain={zeroRevenue ? [0, 100000] : [0, 'auto']} ticks={zeroRevenue ? [0, 25000, 50000, 75000, 100000] : undefined} tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))"
            tickFormatter={(value: number) => new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 }).format(value)}/>
          <Tooltip isAnimationActive={false} cursor={{ stroke: 'hsl(var(--primary)/.3)', strokeDasharray: '4 4' }}
            content={({ active, payload, label }) => {
              const point = payload?.[0]?.payload as Point | undefined
              if (!active || !point) return null
              return <div className="rounded-xl border bg-card px-3 py-2 text-sm shadow-md">
                <p className="text-muted-foreground">{label}</p>
                <p className="font-bold text-primary">{point.revenue === null ? 'Chưa đủ dữ liệu' : formatVND(point.revenue)}</p>
                <p className="text-xs text-muted-foreground">{point.orders} hóa đơn</p>
              </div>
            }}/>
          <Area type="monotone" dataKey="revenue" connectNulls={false} isAnimationActive={false} stroke="hsl(var(--primary))" strokeWidth={2.5}
            fill={`url(#${gradient})`} dot={series.length === 1 ? { r: 3 } : false} activeDot={{ r: 5, stroke: 'hsl(var(--card))', strokeWidth: 2 }}/>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  </div>
}
