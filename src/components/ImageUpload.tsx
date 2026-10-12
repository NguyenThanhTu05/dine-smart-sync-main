import { Button } from '@/components/ui/button'
import { Dialog,DialogContent,DialogFooter,DialogHeader,DialogTitle } from '@/components/ui/dialog'
import { supabase } from '@/integrations/supabase/client'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { Camera,Loader2,RotateCw,Upload,Video,X } from 'lucide-react'
import { useRef,useState } from 'react'
import { toast } from '@/lib/notifications'

interface Props {
  value: string | null | undefined
  onChange: (url: string | null) => void
  folder?: string
  className?: string
  aspect?: 'square' | 'video' | 'qr'
}

export function ImageUpload({ value, onChange, folder = 'menu', className, aspect = 'square' }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [busy, setBusy] = useState(false)
  
  // Các state quản lý popup Camera (Webcam máy tính & Điện thoại duyệt Web)
  const [isCamOpen, setIsCamOpen] = useState(false)
  const [stream, setStream] = useState<MediaStream | null>(null)
  
  // Mặc định chụp menu/qr/logo thì ưu tiên cam sau ('environment') trước cho tiện
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>(
    aspect === 'qr' ? 'environment' : 'user'
  )

  // Hàm xử lý upload file chung lên Supabase Storage
  const upload = async (file: File) => {
    if (!file) return
    if (file.size > 20 * 1024 * 1024) return toast.error('Ảnh quá lớn (tối đa 20MB)')
    setBusy(true)
    try {
      let ext = 'jpg'
      if (file.name && file.name.includes('.')) {
        ext = file.name.split('.').pop() || 'jpg'
      }
      const path = `${crypto.randomUUID()}.${ext}`
      
      const { error } = await supabase.storage
        .from(folder)
        .upload(path, file, { upsert: false, contentType: file.type || 'image/jpeg' })
        
      if (error) throw error
      
      const { data } = supabase.storage.from(folder).getPublicUrl(path)
      
      onChange(data.publicUrl)
      toast.success('Đã tải ảnh lên thành công')
    } catch (e: unknown) {
      toast.error(errorMessage(e) ?? 'Tải ảnh lỗi')
    } finally { 
      setBusy(false) 
    }
  }

  // Hàm kích hoạt bật Camera/Webcam theo mode truyền vào
  const startCamera = async (currentMode: 'user' | 'environment') => {
    // Tắt luồng cũ đang chạy (nếu có) để giải phóng phần cứng thiết bị trước khi lật cam
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
    }

    try {
      setIsCamOpen(true)
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: currentMode, width: 640, height: 640 } 
      })
      setStream(mediaStream)
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
      }
    } catch {
      setIsCamOpen(false)
      toast.error('Không thể truy cập Máy ảnh. Hãy chắc chắn bạn chạy trên localhost hoặc HTTPS và đã cấp quyền Camera!')
    }
  }

  // Hàm lật/xoay chuyển đổi qua lại giữa camera trước và sau
  const toggleCamera = () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user'
    setFacingMode(nextMode)
    startCamera(nextMode)
  }

  // Hàm tắt luồng Camera
  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
    }
    setStream(null)
    setIsCamOpen(false)
    setFacingMode(aspect === 'qr' ? 'environment' : 'user') // Trả về cấu hình gốc khi đóng
  }

  // Hàm chụp lại màn hình từ luồng Video và xuất ra File
  const capturePhoto = () => {
    if (!videoRef.current) return
    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    
    const ctx = canvas.getContext('2d')
    if (ctx) {
      // Nếu đang ở cam trước (user), lật ngược canvas khi vẽ để ảnh xuất ra không bị ngược chữ (đúng chiều selfie)
      if (facingMode === 'user') {
        ctx.translate(canvas.width, 0)
        ctx.scale(-1, 1)
      }

      // Vẽ hình ảnh từ video sang canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      
      // Chuyển canvas thành file blob ảnh để nạp vào hàm upload
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' })
          upload(file)
          stopCamera()
        }
      }, 'image/jpeg', 0.9)
    }
  }

  const ratioClass = aspect === 'qr' ? 'aspect-square w-full max-w-[240px] mx-auto' : aspect === 'video' ? 'aspect-video' : 'aspect-square'
  return (
    <div className={cn('space-y-2', className)}>
      <div className={cn('relative rounded-xl border-2 border-dashed border-border bg-muted/30 overflow-hidden', ratioClass)}>
        {value ? (
          <>
            <img src={value} alt="preview" className="h-full w-full object-cover" loading="lazy" />
            <button type="button" onClick={() => onChange(null)}
              className="absolute right-2 top-2 rounded-full bg-background/90 p-1.5 shadow hover:bg-background">
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : 'Chưa có ảnh'}
          </div>
        )}
      </div>
      
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()} className="flex-1">
          <Upload className="mr-1 h-4 w-4" /> Chọn file
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => startCamera(facingMode)} className="flex-1">
          <Camera className="mr-1 h-4 w-4" /> Chụp ảnh
        </Button>
      </div>
      
      <input ref={fileRef} type="file" accept="image/*" hidden
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />

      {/* POPUP HIỂN THỊ CAMERA XỊN VÀ NÚT XOAY ĐỔI CHIỀU CAM */}
      <Dialog open={isCamOpen} onOpenChange={(open) => !open && stopCamera()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2 pr-6">
              <span className="flex items-center gap-2">
                <Video className="h-5 w-5 text-primary" /> Máy ảnh trực tiếp
              </span>
              
              {/* NÚT XOAY LẬT CAM TRƯỚC/SAU KHI THAO TÁC */}
              <Button 
                type="button" 
                variant="outline" 
                size="icon" 
                className="h-8 w-8 rounded-full shadow-sm" 
                onClick={toggleCamera}
                title="Đổi chiều camera"
              >
                <RotateCw className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DialogTitle>
          </DialogHeader>
          
          <div className={cn(
            "relative overflow-hidden rounded-lg border bg-black flex items-center justify-center w-full",
            aspect === 'video' ? 'aspect-video' : 'aspect-square'
          )}>
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              className={cn(
                "h-full w-full object-cover",
                facingMode === 'user' ? "scale-x-[-1]" : "scale-x-1" // Chỉ lật ngược gương khi dùng cam trước selfie, cam sau giữ chuẩn hướng nhìn
              )}
            />
          </div>
          
          <DialogFooter className="flex sm:justify-between gap-2">
            <Button type="button" variant="ghost" onClick={stopCamera}>
              Hủy bỏ
            </Button>
            <Button type="button" onClick={capturePhoto} className="flex items-center gap-1">
              <Camera className="h-4 w-4" /> Bấm chụp ảnh
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
