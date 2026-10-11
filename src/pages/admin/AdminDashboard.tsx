import { readPages } from '../../../supabase/functions/_shared/readPages'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { supabase } from '@/integrations/supabase/client'
import { loadPaidReport } from '../../../supabase/functions/_shared/loadPaidReport'
import { formatVND } from '@/lib/formatVND'
import { dashboardRevenue } from '@/lib/dashboardRevenue'
import { subscribeOrderChanges } from '@/lib/orderSync'
import { ROLE_LABEL } from '@/lib/roles'
import { subscribeTableChanges } from '@/lib/tableSync'
import { format } from 'date-fns'
import {
CalendarDays,
ChevronLeft,ChevronRight,
CircleDot,
Package,
Receipt,
Trophy,
UserCheck,
Users,
Utensils
} from 'lucide-react'
import { useCallback,useEffect,useRef,useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
Area,
AreaChart,
CartesianGrid,
Cell,Legend,
Pie,
PieChart,
ResponsiveContainer,
Tooltip,
XAxis,YAxis,
} from 'recharts'
import { toast } from 'sonner'
import { paidSales } from '../../../supabase/functions/_shared/paidSales'
import { vietnamDayKey,vietnamDayRange,vietnamPeriodRange } from '../../../supabase/functions/_shared/vietnamTime'

const PIE_COLORS = ['hsl(var(--primary))', 'hsl(24 95% 60%)', 'hsl(160 70% 45%)', 'hsl(280 70% 60%)', 'hsl(200 80% 55%)']

type ViewMode = 'day' | 'week' | 'month' | 'year'

interface ActiveStaff {
  id: string
  full_name: string
  role: string
  checkInAt: string
}

interface TopItemWithImage {
  name: string
  qty: number
  imageUrl?: string | null
}

export default function AdminDashboard() {
  // Quản lý chế độ xem (Mặc định ban đầu là xem theo Ngày)
  const [viewMode, setViewMode] = useState<ViewMode>('day')
  // Mốc thời gian neo cố định để dịch chuyển qua lại bằng mũi tên
  const [currentAnchorDate, setCurrentAnchorDate] = useState<Date>(() => new Date(vietnamDayKey() + 'T12:00:00'))

  // State lưu trữ số liệu tổng hợp động
  const [totalRevenue, setTotalRevenue] = useState<number | null>(0)
  const [totalOrders, setTotalOrders] = useState(0)
  const [legacyInvoiceCount, setLegacyInvoiceCount] = useState(0)
  const [topItems, setTopItems] = useState<TopItemWithImage[]>([])
  const [chartSeries, setChartSeries] = useState<{ dateLabel: string; revenue: number | null; orders: number }[]>([])

  // State nhân viên đang online tại quán
  const [emptyTableCount, setEmptyTableCount] = useState(0)
  const [lowStockItems, setLowStockItems] = useState<{ name: string; stock: number; unit: string; min_stock: number }[]>([])
  const [onlineStaff, setOnlineStaff] = useState<ActiveStaff[]>([])
  const [loadingStaff, setLoadingStaff] = useState(false)

  // Hàm tính toán tiêu đề hiển thị cho khoảng ca thời gian
  const getPeriodTitle = () => {
    if (viewMode === 'day') {
      return format(currentAnchorDate, 'dd/MM/yyyy')
    } else if (viewMode === 'week') {
      const d = new Date(currentAnchorDate)
      const day = d.getDay()
      const diff = d.getDate() - day + (day === 0 ? -6 : 1)
      const monday = new Date(d.setDate(diff))
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)
      return `Tuần ${format(monday, 'dd/MM')} - ${format(sunday, 'dd/MM/yyyy')}`
    } else if (viewMode === 'month') {
      return `Tháng ${format(currentAnchorDate, 'MM/yyyy')}`
    } else {
      return `Năm ${format(currentAnchorDate, 'yyyy')}`
    }
  }

  // Sự kiện bấm nút mũi tên trái (Lùi thời gian)
  const handlePrevPeriod = () => {
    const d = new Date(currentAnchorDate)
    if (viewMode === 'day') {
      d.setDate(d.getDate() - 1)
    } else if (viewMode === 'week') {
      d.setDate(d.getDate() - 7)
    } else if (viewMode === 'month') {
      d.setMonth(d.getMonth() - 1)
    } else if (viewMode === 'year') {
      d.setFullYear(d.getFullYear() - 1)
    }
    setCurrentAnchorDate(d)
  }

  // Sự kiện bấm nút mũi tên phải (Tiến thời gian)
  const handleNextPeriod = () => {
    const d = new Date(currentAnchorDate)
    if (viewMode === 'day') {
      d.setDate(d.getDate() + 1)
    } else if (viewMode === 'week') {
      d.setDate(d.getDate() + 7)
    } else if (viewMode === 'month') {
      d.setMonth(d.getMonth() + 1)
    } else if (viewMode === 'year') {
      d.setFullYear(d.getFullYear() + 1)
    }
    setCurrentAnchorDate(d)
  }

  // Hàm bốc dữ liệu báo cáo từ Supabase và phân tách theo chế độ xem chọn
  const dashboardVersion = useRef(0)
  const invalidatedashboardVersion = useCallback(() => { dashboardVersion.current++ }, [])
  const loadDashboardData = useCallback(async () => {
    const request = ++dashboardVersion.current
    try {
    const { start: startIso, end: endIso } = vietnamPeriodRange(currentAnchorDate, viewMode)
    const orders = await loadPaidReport(
      (offset, last) => supabase.from('orders').select('id,total,paid_at,discount_percent,payment_snapshot')
        .eq('is_paid', true).gte('paid_at', startIso).lt('paid_at', endIso).order('id').range(offset,last),
      (ids, offset, last) => supabase.from('order_items').select('order_id,menu_item_id,name_snapshot,quantity')
        .in('order_id', ids).order('id').range(offset,last),
    )
    const { data: menuImages, error: imageError } = await supabase.from('menu_items').select('id,image_url')
    if (imageError) throw imageError
    const images = new Map((menuImages ?? []).map(item => [item.id,item.image_url]))
    if (request !== dashboardVersion.current) return
    const report = dashboardRevenue(orders, currentAnchorDate, viewMode)
    const { paidOrders } = report
    setTotalRevenue(report.totalRevenue)
    setLegacyInvoiceCount(report.legacyCount)
    setTotalOrders(paidOrders.length)
    setChartSeries(report.chartSeries)

    // 3. Lấy dữ liệu Top món ăn tương ứng trong khoảng thời gian chọn + Đồng bộ ảnh món từ menu_items
    if (request === dashboardVersion.current) setTopItems(paidSales(paidOrders).slice(0,5).map(item => ({...item,imageUrl:item.menu_item_id ? images.get(item.menu_item_id) : null})))
    } catch (error) {
      if (request === dashboardVersion.current) {
        setTotalRevenue(null)
        toast.error((error as {message?:string}).message ?? 'Không tải được báo cáo')
      }
    }
  }, [currentAnchorDate,viewMode])

  // Hàm quét chấm công tìm nhân viên đang hoạt động trực tuyến (Online hôm nay)
  const staffVersion = useRef(0)
  const invalidatestaffVersion = useCallback(() => { staffVersion.current++ }, [])
  const loadOnlineStaff = useCallback(async () => {
    const request = ++staffVersion.current
    setLoadingStaff(true)
    try {
      const { data: ps, error: psError } = await supabase.from('profiles').select('id, full_name, username').order('full_name')
      const { data: rs, error: rsError } = await supabase.from('user_roles').select('user_id, role')

      if (psError || rsError) throw psError ?? rsError
      const roleMap = new Map((rs ?? []).map(r => [r.user_id, r.role]))
      const profilesList = (ps ?? []).map(p => ({
        ...p,
        role: roleMap.get(p.id) ?? 'staff'
      }))

      const { start: todayStart, end: todayEnd } = vietnamDayRange()

      const logs = await readPages((offset,last) => supabase.from('attendance_logs').select('*')
        .gte('at',todayStart).lt('at',todayEnd).order('at').order('id').range(offset,last))
      const staffStatusMap = new Map<string, { lastKind: 'in' | 'out'; at: string }>()

      for (const log of logs) {
        staffStatusMap.set(log.user_id, { lastKind: log.kind as 'in' | 'out', at: log.at })
      }

      const activeStaffList: ActiveStaff[] = []
      staffStatusMap.forEach((status, userId) => {
        if (status.lastKind === 'in') {
          const profile = profilesList.find(p => p.id === userId)
          if (profile) {
            activeStaffList.push({
              id: userId,
              full_name: profile.full_name,
              role: profile.role,
              checkInAt: status.at
            })
          }
        }
      })

      if (request === staffVersion.current) setOnlineStaff(activeStaffList)
    } catch (error) {
      console.error('Lỗi quét ca nhân viên:', error)
    } finally {
      if (request === staffVersion.current) setLoadingStaff(false)
    }
  }, [])

  useEffect(() => {
    void loadDashboardData()
    const stop = subscribeOrderChanges(() => { void loadDashboardData() })
    return () => { invalidatedashboardVersion(); stop() }
  }, [loadDashboardData,invalidatedashboardVersion])

  useEffect(() => {
    let active = true, version = 0
    const counts = async () => {
      const request = ++version
      const [ingredients,tables] = await Promise.all([
        supabase.from('ingredients').select('name,stock,unit,min_stock'),
        supabase.from('restaurant_tables').select('id',{count:'exact',head:true}).eq('status','empty').is('merged_group_id',null).not('area_id','is',null),
      ])
      if (!active || request !== version || ingredients.error || tables.error) return
      setLowStockItems((ingredients.data ?? []).filter(row => row.stock<row.min_stock)); setEmptyTableCount(tables.count ?? 0)
    }
    const refreshCounts = () => { void counts().catch(console.error) }
    const refreshStaff = () => { void loadOnlineStaff() }
    refreshCounts(); refreshStaff()
    const stopTables = subscribeTableChanges(refreshCounts)
    const channel = supabase.channel(`dashboard-${crypto.randomUUID()}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'ingredients'},refreshCounts)
      .on('postgres_changes',{event:'*',schema:'public',table:'attendance_logs'},refreshStaff)
      .subscribe(status => { if (status==='SUBSCRIBED') { refreshCounts(); refreshStaff() } })
    window.addEventListener('focus',refreshStaff)
    const timer = setInterval(refreshStaff,60000)
    return () => { active=false; version++; invalidatestaffVersion(); stopTables(); clearInterval(timer); window.removeEventListener('focus',refreshStaff); void supabase.removeChannel(channel) }
  }, [loadOnlineStaff,invalidatestaffVersion])

  const avgTicket = totalRevenue === null ? null : totalOrders ? totalRevenue / totalOrders : 0

  // Hàm tính tổng số lượng món bán ra của top 5 để quy đổi phần trăm (%) trên nhãn biểu đồ

  // Custom nhãn hiển thị % trực tiếp lên trên lát cắt của biểu đồ tròn
  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: {cx:number;cy:number;midAngle:number;innerRadius:number;outerRadius:number;percent:number}) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5
    const RADIAN = Math.PI / 180
    const x = cx + radius * Math.cos(-midAngle * RADIAN)
    const y = cy + radius * Math.sin(-midAngle * RADIAN)

    if (percent === 0) return null
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" className="text-xs font-black">
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    )
  }

  return (
    <div className="space-y-6 bg-gradient-to-br from-background via-background to-primary/5 p-4 md:p-6 min-h-full">

      {/* Thanh điều hướng Bento Header: Bộ lọc thời gian chuyên sâu */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b pb-5">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Bảng điều khiển</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4" /> Hôm nay: {new Date().toLocaleDateString('vi-VN', {timeZone:'Asia/Ho_Chi_Minh'})}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-muted p-1 rounded-xl border">
            {(['day', 'week', 'month', 'year'] as const).map((mode) => (
              <Button
                key={mode}
                variant={viewMode === mode ? 'default' : 'ghost'}
                size="sm"
                className={`rounded-lg px-3 transition-all font-bold text-xs ${viewMode === mode ? 'shadow-sm text-foreground bg-background' : 'text-muted-foreground hover:text-foreground'
                  }`}
                onClick={() => setViewMode(mode)}
              >
                {mode === 'day' ? 'Ngày' : mode === 'week' ? 'Tuần' : mode === 'month' ? 'Tháng' : 'Năm'}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2 bg-card border rounded-xl p-1 shadow-sm">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={handlePrevPeriod}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs font-extrabold min-w-[130px] text-center px-1 text-primary tracking-tight uppercase">
              {getPeriodTitle()}
            </span>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={handleNextPeriod}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Thẻ chỉ số phân tích KPI */}
   <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <NavLink to="/admin/bills">
          <KpiCard
            icon={<Receipt className="h-5 w-5" />}
            label="Doanh thu"
            value={totalRevenue === null ? '—' : formatVND(totalRevenue)}
            accent="bg-gradient-to-br from-primary/15 to-primary/5 border-primary/20 hover:scale-[1.02] transition-transform cursor-pointer"
            footer={<span className="text-xs text-muted-foreground">{legacyInvoiceCount ? `Có ${legacyInvoiceCount} hóa đơn cũ: dùng số tiền gốc đã lưu` : 'Tổng thu hóa đơn thành công'}</span>}
          />
        </NavLink>
        <NavLink to="/admin/tables">
          <KpiCard
            icon={<Package className="h-5 w-5" />}
            label="Số lượng Bàn"
            value={`${totalOrders} bàn`}
            accent="bg-gradient-to-br from-orange-500/15 to-orange-500/5 border-orange-500/20 hover:scale-[1.02] transition-transform cursor-pointer"
            footer={<span className="text-xs text-muted-foreground">Trung bình {totalOrders ? avgTicket === null ? '—' : formatVND(avgTicket) : '0đ'}/bàn</span>}
          />
        </NavLink>
        <NavLink to="/admin/catalog?tab=inventory">
          <KpiCard
            icon={<Package className="h-5 w-5" />}
            label="Nguyên liệu sắp hết"
            value={lowStockItems.length === 0 ? 'Đủ hàng ✓' : `${lowStockItems.length} nguyên liệu`}
            accent="bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 border-emerald-500/20 hover:scale-[1.02] transition-transform cursor-pointer"
            footer={
              lowStockItems.length === 0
                ? <span className="text-xs text-muted-foreground">Kho hàng ổn định</span>
                : <div className="flex gap-2 flex-wrap max-h-[40px] overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-orange-300 scrollbar-track-transparent">
                    {lowStockItems.map((i, idx) => (
                      <span key={idx} className="text-xs text-orange-500 font-medium bg-orange-500/10 px-2 py-0.5 rounded-full whitespace-nowrap">
                        • {i.name}
                      </span>
                    ))}
                  </div>
            }
          />
        </NavLink>
        <NavLink to="/admin/tables">
          <KpiCard
            icon={<Users className="h-5 w-5" />}
            label="Bàn còn trống"
            value={`${emptyTableCount} bàn`}
            accent="bg-gradient-to-br from-purple-500/15 to-purple-500/5 border-purple-500/20 hover:scale-[1.02] transition-transform cursor-pointer"
            footer={<span className="text-xs text-muted-foreground"></span>}
          />
        </NavLink>
      </div>

      {/* Grid: Biểu đồ & Nhân viên Online */}
      <div className="grid gap-6 lg:grid-cols-3">

        {/* Đồ thị vùng doanh thu */}
        <Card className="p-6 lg:col-span-2 shadow-sm border-primary/5">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 className="text-lg font-bold">Biến động doanh thu chi tiết</h2>
              <p className="text-xs text-muted-foreground">{legacyInvoiceCount ? 'Hóa đơn cũ dùng số tiền gốc; không tính lại VAT, phí hoặc giảm giá.' : 'Phân tích theo mốc thời gian đang hiển thị'}</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-black text-primary">{totalRevenue === null ? '—' : formatVND(totalRevenue)}</div>
              <div className="text-xs text-muted-foreground">{totalOrders} hóa đơn</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartSeries} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="dateLabel" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} interval={0} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false}
                tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}tr` : `${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 12,
                  boxShadow: '0 10px 30px -10px hsl(var(--primary) / 0.25)',
                }}
                formatter={(v) => [formatVND(Number(v)), 'Doanh thu']}
                labelFormatter={(l) => `${l}`}
              />
              <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={3}
                fill="url(#revGrad)" dot={{ fill: 'hsl(var(--primary))', r: 3 }}
                activeDot={{ r: 5, stroke: 'hsl(var(--background))', strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        {/* Khối danh sách thẻ nhân viên online */}
        <Card className="p-6 border-emerald-500/10 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Users className="h-5 w-5 text-emerald-500" />
                Nhân viên tại quán
              </h2>
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 font-bold gap-1 animate-pulse">
                <CircleDot className="h-2 w-2 fill-emerald-500" /> {onlineStaff.length} Online
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-4">Danh sách nhân viên đã Check-in và chưa Checkout hôm nay</p>

            {loadingStaff ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Đang quét ca làm việc...</div>
            ) : onlineStaff.length === 0 ? (
              <div className="py-12 border-2 border-dashed border-muted rounded-xl text-center flex flex-col items-center justify-center gap-2">
                <UserCheck className="h-8 w-8 text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground font-medium">Hiện chưa có nhân viên nào vào ca</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
                {onlineStaff.map((staff) => (
                  <div
                    key={staff.id}
                    className="flex items-center justify-between p-3 rounded-xl border bg-card hover:bg-accent/40 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-sm uppercase">
                        {staff.full_name.slice(0, 2)}
                      </div>
                      <div>
                        <div className="font-semibold text-sm">{staff.full_name}</div>
                        <div className="text-[11px] text-muted-foreground">Vào ca: {format(new Date(staff.checkInAt), 'HH:mm')}</div>
                      </div>
                    </div>
                    <Badge variant="secondary" className="font-medium text-xs">
                      {ROLE_LABEL[staff.role as keyof typeof ROLE_LABEL] ?? staff.role}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={loadOnlineStaff}
            className="mt-4 text-xs font-semibold text-primary hover:underline text-center w-full"
          >
            🔄 Làm mới danh sách đồng bộ
          </button>
        </Card>
      </div>

      {/* Khối Top món bán chạy & Đồ thị tròn tỷ trọng */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top 5 món ăn có hiển thị ảnh menu đồng bộ */}
        <Card className="p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-bold flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            Top 5 món bán chạy (Trong kỳ chọn)
          </h2>
          {topItems.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Chưa có dữ liệu món ăn cho khoảng thời gian này</p>
          ) : (
            <div className="space-y-4">
              {topItems.map((t, i) => {
                const max = topItems[0].qty
                return (
                  <div key={t.name} className="flex items-center gap-3">
                    {/* Khối bọc số thứ tự và ảnh món ăn đồng bộ từ Menu */}
                    <div className="relative h-12 w-12 rounded-xl overflow-hidden bg-muted border flex-shrink-0">
                      {t.imageUrl ? (
                        <img src={t.imageUrl} alt={t.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground bg-primary/5">
                          <Utensils className="h-5 w-5" />
                        </div>
                      )}
                      <span className="absolute top-0 left-0 h-5 w-5 inline-flex items-center justify-center rounded-br-xl text-[10px] font-black text-white"
                        style={{ background: PIE_COLORS[i] }}>
                        {i + 1}
                      </span>
                    </div>

                    <div className="flex-1">
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="font-bold text-foreground">{t.name}</span>
                        <span className="font-extrabold tabular-nums text-primary">{t.qty} suất</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${max > 0 ? (t.qty / max) * 100 : 0}%`, background: PIE_COLORS[i] }} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Biểu đồ tròn hiển thị nhãn % trực tiếp */}
        <Card className="p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-bold">Tỷ trọng món bán (%)</h2>
          {topItems.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Chưa có dữ liệu đồ thị</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={topItems}
                  dataKey="qty"
                  nameKey="name"
                  innerRadius={45}
                  outerRadius={90}
                  paddingAngle={3}
                  labelLine={false}
                  label={renderCustomizedLabel} // Thêm hiển thị % trực tiếp lên thớt biểu đồ
                >
                  {topItems.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                </Pie>
                <Tooltip formatter={(v) => [`${v} suất`, 'Số lượng']} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>
    </div>
  )
}

function KpiCard({ icon, label, value, footer, accent }: {
  icon: React.ReactNode; label: string; value: string; footer: React.ReactNode; accent: string;
}) {
  return (
    <Card className={`relative overflow-hidden p-5 ${accent} shadow-sm`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span className="rounded-lg bg-background/60 p-2 text-foreground">{icon}</span>
      </div>
      <div className="mt-3 truncate text-2xl font-black">{value}</div>
      <div className="mt-2">{footer}</div>
    </Card>
  )
}
