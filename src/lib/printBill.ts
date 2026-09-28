// TypeScript / React
import { supabase } from '@/integrations/supabase/client'
import { formatVND } from '@/hooks/useGlobalCounts'

const esc = (s: any) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

export interface PrintBillOptions {
  tableNameOverride?: string
  currentUserId?: string
  overridePaymentMethod?: 'cash' | 'qr' | 'card'
}

const ROLE_LABEL: Record<string, string> = {
  staff: 'Nhân viên',
  admin: 'Quản lý',
  cashier: 'Thu ngân',
  kitchen: 'Bếp',
}

export async function printBill(orderId: string, opts: PrintBillOptions = {}) {
  const [{ data: order }, { data: ps }] = await Promise.all([
    supabase.from('orders').select('*, order_items(*), restaurant_tables(name, areas(name))').eq('id', orderId).maybeSingle(),
    supabase.from('payment_settings').select('*').eq('id', 1).maybeSingle(),
  ])
  if (!order) return

  // 1. LẤY TÊN NGƯỜI PHỤC VỤ (Cố định chuẩn xác từ staff_id gốc)
 let serverName = ''
  if (order.staff_id) {
    const [{ data: pServer }, { data: rServer }] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', order.staff_id).maybeSingle(),
      supabase.from('user_roles').select('role').eq('user_id', order.staff_id).maybeSingle(),
    ])
    const sName = pServer?.full_name ?? ''
    const sRole = rServer?.role ? (ROLE_LABEL[rServer.role] ?? rServer.role) : ''
    serverName = sRole ? `${sRole} - ${sName}` : sName
  }

  // 2. LẤY TÊN NGƯỜI THU TIỀN (Nếu đang in tính tiền thì lấy user hiện tại, nếu xem lại bill cũ thì giải mã từ vết chốt đơn)
  

let cashierName = ''
if (opts.currentUserId) {
  const [{ data: pCashier }, { data: rCashier }] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', opts.currentUserId).maybeSingle(),
    supabase.from('user_roles').select('role').eq('user_id', opts.currentUserId).maybeSingle(),
  ])
  const name = pCashier?.full_name ?? ''
  const role = rCashier?.role ? (ROLE_LABEL[rCashier.role] ?? rCashier.role) : ''
  cashierName = role ? `${role} - ${name}` : name
} else if (order.notes && order.notes.includes('[Người thu:')) {
  const match = order.notes.match(/\[Người thu:\s*([^\]]+)\]/)
  if (match && match[1]) cashierName = match[1].trim()
}
  let tableLabel = opts.tableNameOverride ?? order.restaurant_tables?.name ?? '—'
  if (!opts.tableNameOverride && order.restaurant_tables) {
    const { data: g } = await supabase.from('restaurant_tables')
      .select('name, merged_group_id, sort_order, area_id')
      .eq('id', order.table_id).maybeSingle()
    if (g?.merged_group_id) {
      const { data: peers } = await supabase.from('restaurant_tables')
        .select('name, sort_order').eq('merged_group_id', g.merged_group_id).order('sort_order')
      if (peers && peers.length) tableLabel = peers.map(p => p.name).join(' + ')
    }
  }

  const items: any[] = order.order_items ?? []

  const groupedItems = items.reduce((acc: any[], it) => {
    const key = `${it.name_snapshot}__${it.price_snapshot}__${it.notes ?? ''}`
    const existing = acc.find((x: any) => x._key === key)
    if (existing) {
      existing.quantity += Number(it.quantity)
    } else {
      acc.push({ ...it, quantity: Number(it.quantity), _key: key })
    }
    return acc
  }, [])

  const subtotal = groupedItems.reduce((s: number, it: any) => s + Number(it.price_snapshot) * Number(it.quantity), 0)
const vatPct = Number(ps?.vat_percent ?? 0)
const svcPct = Number(ps?.service_percent ?? 0)
const globalPct = Number(ps?.global_discount_percent ?? 0)
const tablePct  = Number(order.discount_percent ?? 0)
const discountPct = tablePct > 0 ? tablePct : globalPct
const svc = Math.round((subtotal * svcPct) / 100)
const afterService = subtotal + svc
const vat = Math.round((afterService * vatPct) / 100)
const afterVAT = afterService + vat
const discountAmt = Math.round((afterVAT * discountPct) / 100)
const total = afterVAT - discountAmt
  const methodLabel: Record<string, string> = { 
    cash: 'Tiền mặt', 
    qr: 'Chuyển khoản QR', 
    card: 'Thẻ' 
  }
  
  const finalPaymentMethod = opts.overridePaymentMethod || order.payment_method || 'cash'
  const paidAt = order.paid_at ? new Date(order.paid_at) : new Date()
  const fmtDate = (d: Date) => d.toLocaleString('vi-VN', { hour12: false })
  const invoiceNo = `HD-${(order.id || '').slice(0, 8).toUpperCase()}`

  const rowsHtml = groupedItems.map((it: any, i: number) => `
    <tr>
      <td class="c">${i + 1}</td>
      <td>${esc(it.name_snapshot)}${it.notes ? `<div class="note">${esc(it.notes)}</div>` : ''}</td>
      <td class="c">${it.quantity}</td>
      <td class="r">${formatVND(it.price_snapshot)}</td>
      <td class="r">${formatVND(it.price_snapshot * it.quantity)}</td>
    </tr>`).join('')



  const html = `<!doctype html><html><head><meta charset="utf-8"/>
<title>${esc(invoiceNo)}</title>
<style>
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:#fff;color:#111;font-family:'Helvetica Neue',Arial,'Segoe UI',sans-serif}
  .bill{width:80mm;margin:0 auto;padding:6mm 5mm;font-size:12px;line-height:1.45}
  .center{text-align:center}
  .r{text-align:right} .c{text-align:center} .l{text-align:left}
  .shop{font-size:18px;font-weight:800;letter-spacing:.5px;text-transform:uppercase}
  .logo{max-height:48px;max-width:60%;margin:0 auto 4px;display:block;object-fit:contain}
  .muted{color:#555;font-size:11px}
  .slogan{font-style:italic;color:#444;font-size:11px;margin-top:2px}
  .divider{border:0;border-top:1px dashed #000;margin:8px 0}
  .meta{display:grid;grid-template-columns:auto 1fr;gap:2px 8px;font-size:11.5px}
  .meta .k{color:#444}
  table{width:100%;border-collapse:collapse;margin-top:4px;font-size:11.5px}
  thead th{border-bottom:1px solid #000;padding:4px 2px;font-weight:700;text-align:left}
  tbody td{padding:3px 2px;vertical-align:top;border-bottom:1px dotted #bbb}
  .note{color:#555;font-size:10.5px;font-style:italic}
  .totals{margin-top:6px;font-size:12px}
  .totals .row{display:flex;justify-content:space-between;padding:2px 0}
  .grand{border-top:1px solid #000;border-bottom:3px double #000;margin-top:4px;padding:6px 0;display:flex;justify-content:space-between;font-size:15px;font-weight:800}
  .footer{margin-top:10px;text-align:center;font-size:11px}
  .thanks{font-weight:700;font-size:12.5px;margin-bottom:4px}
  .qr{margin:8px auto 0;max-width:38mm;display:block}
  .policy{margin-top:6px;color:#444;font-size:10.5px;white-space:pre-wrap}
  @page{size:80mm auto;margin:0}
  @media print{body{margin:0}}
</style></head><body>
<div class="bill">
  <div class="center">
    ${ps?.logo_url ? `<img class="logo" src="${esc(ps.logo_url)}" alt="logo"/>` : ''}
    <div class="shop">${esc(ps?.shop_name || 'NHÀ HÀNG')}</div>
    ${ps?.address ? `<div class="muted">${esc(ps.address)}</div>` : ''}
    ${ps?.phone ? `<div class="muted">ĐT: ${esc(ps.phone)}</div>` : ''}
  </div>
  <hr class="divider"/>
  <div class="center" style="font-weight:700;font-size:13px;letter-spacing:1px">HÓA ĐƠN THANH TOÁN</div>
  <div class="center muted">Số: ${esc(invoiceNo)}</div>
  <hr class="divider"/>
  <div class="meta">
    <div class="k">Ngày:</div><div>${esc(fmtDate(paidAt))}</div>
    <div class="k">Bàn:</div><div>${esc(tableLabel)}${order.restaurant_tables?.areas?.name ? ` <span class="muted">(${esc(order.restaurant_tables.areas.name)})</span>` : ''}</div>
    <div class="k">Phục vụ:</div><div>${esc(serverName || 'Nhân viên')}</div>
    <div class="k">Thanh toán:</div><div>${esc(methodLabel[finalPaymentMethod] ?? 'Tiền mặt')}</div>
    ${cashierName ? `<div class="k">Người thu:</div><div>${esc(cashierName)}</div>` : ''}
  </div>
  <table>
    <thead><tr><th class="c" style="width:8%">#</th><th>Tên món</th><th class="c" style="width:10%">SL</th><th class="r" style="width:22%">Đơn giá</th><th class="r" style="width:24%">T.Tiền</th></tr></thead>
    <tbody>${rowsHtml || `<tr><td colspan="5" class="c muted">— Không có món —</td></tr>`}</tbody>
  </table>
  <div class="totals">
    <div class="row"><span>Tạm tính</span><span>${formatVND(subtotal)}</span></div>
${svcPct > 0 ? `<div class="row"><span>Phí dịch vụ (${svcPct}%)</span><span>${formatVND(svc)}</span></div>` : ''}
${vatPct > 0 ? `<div class="row"><span>VAT (${vatPct}%)</span><span>${formatVND(vat)}</span></div>` : ''}
${discountPct > 0 ? `<div class="row" style="color:#c00"><span>Giảm giá (${discountPct}%)</span><span>-${formatVND(discountAmt)}</span></div>` : ''}
    <div class="grand"><span>TỔNG THANH TOÁN</span><span>${formatVND(total)}</span></div>
  </div>
  <div class="footer">
    <div class="thanks">${esc(ps?.footer_note || 'Cảm ơn quý khách và hẹn gặp lại!')}</div>
    ${ps?.extra_qr_url ? `<img class="qr" src="${esc(ps.extra_qr_url)}" alt="qr"/>` : ''}
  </div>
</div>
<script>window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print();},150)});</script>
</body></html>`

  const iframe = document.createElement('iframe')
  Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0', visibility: 'hidden' })
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument!
  doc.open(); doc.write(html); doc.close()
  setTimeout(() => { try { iframe.remove() } catch {} }, 30000)
}