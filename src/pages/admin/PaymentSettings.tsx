import { ImageUpload } from '@/components/ImageUpload'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/integrations/supabase/client'
import type { Tables } from '@/integrations/supabase/types'
import { decimalInput,optionalText,phoneInput } from '@/lib/inputValidation'
import { useEffect,useState } from 'react'
import { toast } from 'sonner'
type PercentKey = 'vat_percent' | 'service_percent' | 'global_discount_percent'
type PaymentForm = Partial<Omit<Tables<'payment_settings'>, 'id' | 'updated_at' | PercentKey>> & Partial<Record<PercentKey, number | string | null>>
const percentKeys = ['vat_percent', 'service_percent', 'global_discount_percent'] as const

// Input số % — click xóa 0, nhập tuỳ ý
function PercentInput({ value, onChange }: { value: number | string; onChange: (v: string) => void }) {
  return (
    <Input
      type="number"
      min={0}
      max={100}
      value={value === 0 ? '' : value}
      placeholder="0"
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        onChange(e.target.value)
      }}
    />
  )
}

export default function PaymentSettings() {
  const [s, setS] = useState<PaymentForm>({
    qr_image_url: '', bank_name: '', account_holder: '', account_number: '',
    shop_name: '', logo_url: '', address: '', phone: '', tax_code: '', slogan: '',
    footer_note: 'Cảm ơn quý khách và hẹn gặp lại!',
    vat_percent: 0, service_percent: 0, global_discount_percent: 0,
    extra_qr_url: '', policy_note: '',
  })

  useEffect(() => {
    supabase
      .from('payment_settings')
      .select('account_holder,account_number,address,bank_name,extra_qr_url,footer_note,global_discount_percent,logo_url,phone,policy_note,qr_image_url,service_percent,shop_name,slogan,tax_code,vat_percent')
      .eq('id', 1)
      .single()
      .then(({ data }) => { if (data) setS(prev => ({ ...prev, ...data })); })
  }, [])

  const upd = (k: keyof PaymentForm, v: string | number | null) => setS((prev) => ({ ...prev, [k]: v }))

  const save = async () => {
    const dataToUpdate: Omit<PaymentForm, PercentKey> & Partial<Record<PercentKey, number>> = {}
    try {
      for (const key of percentKeys) dataToUpdate[key] = decimalInput(s[key], 'Phần trăm', 6, 100)
      dataToUpdate.phone = phoneInput(s.phone)
      for (const key of Object.keys(s) as (keyof PaymentForm)[]) {
        if (percentKeys.some(percent => percent === key) || key === 'phone') continue
        const value = s[key]
        if (typeof value === 'string') Object.assign(dataToUpdate, { [key]: optionalText(value, key, key.includes('url') ? 2048 : 10000) })
      }
    } catch (error) { return toast.error((error as Error).message) }
    const { error } = await supabase
      .from('payment_settings')
      .update({ ...dataToUpdate, updated_at: new Date().toISOString() })
      .eq('id', 1)
    if (error) toast.error(error.message)
    else toast.success('Đã lưu cài đặt Thanh toán thành công!')
  }

  return (
    <div className="max-w-5xl space-y-6 p-6 mx-auto">
      {/* Thanh tiêu đề chính */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">Cài đặt Thanh toán</h1>
          <p className="text-sm text-muted-foreground">Thiết lập thông tin tài khoản thanh toán và cấu hình hiển thị hóa đơn.</p>
        </div>
        <Button onClick={save} className="w-full sm:w-auto px-6">Lưu cài đặt</Button>
      </div>

      <div className="space-y-8">
        
        {/* THẺ 1: CẤU HÌNH THANH TOÁN (Tài khoản ngân hàng + Ảnh QR) */}
        <Card className="p-4 space-y-2">
          <div className="border-b pb-2">
            <h2 className="text-lg font-semibold text-primary">1. Cấu hình thanh toán qua Mã QR</h2>
            <p className="text-xs text-muted-foreground">Thông tin phục vụ cho việc chuyển khoản nhanh nhận tiền của cửa hàng.</p>
          </div>

         <div className="grid gap-3 md:grid-cols-3"> 
            {/* Cột thông tin chữ (chiếm 2 cột) */}
           <div className="md:col-span-2 flex flex-col gap-2">
              <div>
                <Label>Ngân hàng</Label>
                <Input value={s.bank_name ?? ''} onChange={(e) => upd('bank_name', e.target.value)} placeholder="VD: Vietcombank"/>
              </div>
              <div>
                <Label>Chủ tài khoản</Label>
                <Input value={s.account_holder ?? ''} onChange={(e) => upd('account_holder', e.target.value)} placeholder="VD: NGUYEN VAN A"/>
              </div>
              <div>
                <Label>Số tài khoản</Label>
                <Input value={s.account_number ?? ''} onChange={(e) => upd('account_number', e.target.value)} placeholder="VD: 1023456789"/>
              </div>
            </div>

            {/* Cột ảnh mã QR (chiếm 1 cột) */}
            <div className="space-y-2">
              <Label className="font-medium">Ảnh mã QR thanh toán</Label>
              <p className="text-[11px] text-muted-foreground leading-tight">Nhân viên sẽ thấy ảnh này tại quầy thu ngân khi khách quét mã.</p>
              <div className="bg-muted/30 p-2 rounded-lg border border-dashed">
                <ImageUpload value={s.qr_image_url} onChange={(url) => upd('qr_image_url', url)} folder="qr" aspect="qr"/>
              </div>
            </div>
          </div>
        </Card>


        {/* THẺ 2: CẤU HÌNH IN BILL (Thông tin quán, Chi phí, Logo, Wifi/Fanpage) */}
        <Card className="p-4 space-y-3">
          <div className="border-b pb-2">
            <h2 className="text-lg font-semibold text-primary">2. Thông tin & Giao diện in hóa đơn (Bill)</h2>
            <p className="text-xs text-muted-foreground">Cấu hình các thành phần hiển thị trên phiếu thanh toán của khách hàng.</p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {/* Khu vực thông tin văn bản & Chi phí (chiếm 2 cột) */}
            <div className="md:col-span-2 flex flex-col gap-2">
              
              {/* Thông tin hành chính của quán */}
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Tên quán *</Label>
                  <Input value={s.shop_name ?? ''} onChange={(e) => upd('shop_name', e.target.value)} placeholder="VD: Nhà hàng ABC"/>
                </div>
                <div>
                  <Label>Slogan</Label>
                  <Input value={s.slogan ?? ''} onChange={(e) => upd('slogan', e.target.value)} placeholder="VD: Hương vị quê nhà"/>
                </div>
              </div>

              <div>
                <Label>Địa chỉ</Label>
                <Input value={s.address ?? ''} onChange={(e) => upd('address', e.target.value)}/>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Số điện thoại</Label>
                  <Input value={s.phone ?? ''} onChange={(e) => upd('phone', e.target.value)}/>
                </div>
                <div>
                  <Label>Mã số thuế</Label>
                  <Input value={s.tax_code ?? ''} onChange={(e) => upd('tax_code', e.target.value)}/>
                </div>
              </div>

              {/* Các thiết lập phần trăm thuế / phí */}
              <div className="grid gap-4 md:grid-cols-3 pt-2 border-t border-dashed">
                <div>
                  <Label>VAT (%)</Label>
                  <PercentInput value={s.vat_percent ?? 0} onChange={(v) => upd('vat_percent', v)}/>
                </div>
                <div>
                  <Label>Phí dịch vụ (%)</Label>
                  <PercentInput value={s.service_percent ?? 0} onChange={(v) => upd('service_percent', v)}/>
                </div>
                <div>
                  <Label>Giảm giá chung (%)</Label>
                  <PercentInput value={s.global_discount_percent ?? 0} onChange={(v) => upd('global_discount_percent', v)}/>
                  <p className="mt-1 text-[11px] text-muted-foreground leading-tight">Áp dụng tự động cho mọi bàn</p>
                </div>
              </div>

              {/* Lời chúc chân trang & Chính sách */}
              <div className="space-y-4 pt-2 border-t border-dashed">
                <div>
                  <Label>Lời cảm ơn (cuối bill)</Label>
                  <Input value={s.footer_note ?? ''} onChange={(e) => upd('footer_note', e.target.value)}/>
                </div>
                <div>
                  <Label>Chính sách / Ghi chú thêm</Label>
                  <Textarea rows={3} value={s.policy_note ?? ''} onChange={(e) => upd('policy_note', e.target.value)} placeholder="VD: Đổi trả trong 24h, không hoàn tiền sau khi đã sử dụng..."/>
                </div>
              </div>
            </div>

            {/* Khu vực Upload ảnh cho Bill (chiếm 1 cột bên phải) */}
            <div className="space-y-5">
              {/* Logo quán */}
              <div className="space-y-2">
                <Label className="font-medium">Logo quán</Label>
                <p className="text-[11px] text-muted-foreground leading-tight">Hiển thị ở trên cùng của hóa đơn.</p>
                <div className="bg-muted/30 p-2 rounded-lg border border-dashed">
                  <ImageUpload value={s.logo_url} onChange={(url) => upd('logo_url', url)} folder="logo" aspect="square"/>
                </div>
              </div>

              {/* QR Fanpage hoặc Wifi */}
              <div className="space-y-2 pt-2 border-t border-dashed">
                <Label className="font-medium">QR Fanpage / Wifi (tùy chọn)</Label>
                <p className="text-[11px] text-muted-foreground leading-tight">Hiển thị dưới cùng hóa đơn để khách quét kết nối.</p>
                <div className="bg-muted/30 p-2 rounded-lg border border-dashed">
                  <ImageUpload value={s.extra_qr_url} onChange={(url) => upd('extra_qr_url', url)} folder="qr" aspect="qr"/>
                </div>
              </div>
            </div>
          </div>
        </Card>

      </div>

      {/* Nút lưu phụ chân trang */}
      <div className="flex justify-end pt-2">
        <Button onClick={save} className="w-full md:w-auto px-8">Lưu cài đặt</Button>
      </div>
    </div>
  )
}
