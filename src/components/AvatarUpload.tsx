import { useRef, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { Camera, Upload, Trash2, Loader2, Video, RotateCw } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface Props {
  value: string | null | undefined
  fallback?: string
  folder?: string
  size?: number
  onChange: (url: string | null) => void | Promise<void>
}

export function AvatarUpload({ value, fallback = 'A', folder = 'avatars', size = 96, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [busy, setBusy] = useState(false)

  // Các state quản lý luồng Camera
  const [isCamOpen, setIsCamOpen] = useState(false)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user') // 'user' là cam trước, 'environment' là cam sau

  // Hàm xử lý tải ảnh lên Supabase Storage
  const upload = async (file?: File | null) => {
    if (!file) return
    if (file.size > 20 * 1024 * 1024) return toast.error('Ảnh quá lớn (tối đa 20MB)')
    setBusy(true)
    try {
      let ext = 'jpg'
      if (file.name && file.name.includes('.')) {
        ext = file.name.split('.').pop() || 'jpg'
      }

      const path = `${crypto.randomUUID()}.${ext}`
      
      const { error: uploadError } = await supabase.storage
        .from(folder)
        .upload(path, file, { upsert: false, contentType: file.type || 'image/jpeg' })
        
      if (uploadError) {
        throw new Error(`Lỗi Storage: ${uploadError.message}`)
      }
      
      const { data } = supabase.storage.from(folder).getPublicUrl(path)
      if (!data?.publicUrl) {
        throw new Error('Không thể khởi tạo đường dẫn ảnh công khai')
      }

      try {
        await onChange(data.publicUrl)
      } catch (onChangeError: any) {
        throw new Error(`Lỗi cập nhật bảng Profiles: ${onChangeError.message || onChangeError}`)
      }

    } catch (e: any) {
      console.error(e)
      toast.error(e.message || 'Tải ảnh thất bại')
    } finally { 
      setBusy(false) 
    }
  }

  // Hàm khởi chạy camera theo mode ống kính được truyền vào
  const startCamera = async (currentMode: 'user' | 'environment') => {
    // Tắt luồng cũ đi trước nếu đang chạy để giải phóng phần cứng
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
    } catch (err: any) {
      setIsCamOpen(false)
      toast.error('Không thể truy cập Máy ảnh. Hãy chắc chắn bạn chạy trên localhost/HTTPS và cấp quyền đầy đủ!')
    }
  }

  // Hàm lật xoay chuyển đổi góc quay camera trước/sau
  const toggleCamera = () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user'
    setFacingMode(nextMode)
    startCamera(nextMode) // Khởi động lại camera với ống kính mới
  }

  // Tắt hẳn luồng camera khi đóng popup
  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
    }
    setStream(null)
    setIsCamOpen(false)
    setFacingMode('user') // Trả về mặc định cam trước cho lần mở sau
  }

  // Chụp lại khung hình video chuyển sang tệp blob nộp lên database
  const capturePhoto = () => {
    if (!videoRef.current) return
    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    
    const ctx = canvas.getContext('2d')
    if (ctx) {
      // Nếu đang ở chế độ cam trước (selfie), lật ngược canvas khi vẽ để ảnh xuôi theo hướng người nhìn
      if (facingMode === 'user') {
        ctx.translate(canvas.width, 0)
        ctx.scale(-1, 1)
      }
      
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `avatar-${Date.now()}.jpg`, { type: 'image/jpeg' })
          upload(file)
          stopCamera()
        }
      }, 'image/jpeg', 0.9)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={cn('relative rounded-full ring-2 ring-border hover:ring-primary transition focus:outline-none focus:ring-primary')} style={{ width: size, height: size }}>
            <Avatar className="h-full w-full">
              <AvatarImage src={value ?? undefined} />
              <AvatarFallback className="text-2xl">{fallback[0]}</AvatarFallback>
            </Avatar>
            {busy && (
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/60">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center">
          <DropdownMenuItem onClick={() => fileRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" /> Chọn ảnh từ thiết bị
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => startCamera(facingMode)}>
            <Camera className="mr-2 h-4 w-4" /> Chụp ảnh
          </DropdownMenuItem>
          {value && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onChange(null)}>
                <Trash2 className="mr-2 h-4 w-4" /> Xoá ảnh đại diện
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
      
      {/* KHUNG POPUP MODAL HIỂN THỊ LUỒNG VIDEO WEBCAM TRỰC TIẾP */}
      <Dialog open={isCamOpen} onOpenChange={(open) => !open && stopCamera()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2 pr-6">
              <span className="flex items-center gap-2">
                <Video className="h-5 w-5 text-primary" /> Máy ảnh trực tiếp
              </span>
              
              {/* NÚT XOAY CAM THÔNG MINH NẰM GÓC PHẢI TIÊU ĐỀ */}
              <Button 
                type="button" 
                variant="outline" 
                size="icon" 
                className="h-8 w-8 rounded-full" 
                onClick={toggleCamera}
                title="Đổi chiều camera"
              >
                <RotateCw className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DialogTitle>
          </DialogHeader>
          
          <div className="relative overflow-hidden rounded-full border bg-black aspect-square max-w-[300px] mx-auto flex items-center justify-center ring-4 ring-muted">
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              className={cn(
                "h-full w-full object-cover",
                facingMode === 'user' ? "scale-x-[-1]" : "scale-x-1" // Chỉ lật gương khi dùng cam trước selfie
              )}
            />
          </div>
          
          <DialogFooter className="flex sm:justify-between gap-2 mt-2">
            <Button type="button" variant="ghost" onClick={stopCamera}>
              Hủy bỏ
            </Button>
            <Button type="button" onClick={capturePhoto} className="flex items-center gap-1">
              <Camera className="h-4 w-4" /> Bấm chụp hình
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}