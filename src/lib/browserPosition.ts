let pendingPosition: Promise<GeolocationPosition> | null = null

export class LocationError extends Error {
  constructor(message: string, readonly diagnostic: string) {
    super(message)
    this.name = 'LocationError'
  }
}

export function getLocationDiagnostic(error: unknown): string | null {
  return error instanceof LocationError ? error.diagnostic : null
}

export async function getBrowserLocationPermission(): Promise<PermissionState | 'unknown'> {
  try {
    if (navigator.permissions?.query) {
      return (await navigator.permissions.query({ name: 'geolocation' })).state
    }
  } catch { /* Permissions API is not supported by every browser. */ }
  return 'unknown'
}

export function getBrowserPosition(): Promise<GeolocationPosition> {
  if (pendingPosition) return pendingPosition
  const request = new Promise<GeolocationPosition>((resolve, reject) => {
    if (window.isSecureContext === false) {
      return reject(new Error('Vị trí cần kết nối HTTPS hoặc localhost.'))
    }
    if (!navigator.geolocation) return reject(new Error('Trình duyệt không hỗ trợ GPS'))

    let settled = false
    let attempt = 0
    let errorVersion = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const clearTimer = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined }
    const succeed = (position: GeolocationPosition) => {
      if (settled) return
      settled = true
      clearTimer()
      resolve(position)
    }
    const rejectRequest = (error: unknown) => {
      if (settled) return
      settled = true
      clearTimer()
      reject(error)
    }
    const handleError = async (err: GeolocationPositionError, retried: boolean, requestAttempt: number) => {
      if (settled || requestAttempt !== attempt) return
      const version = ++errorVersion
      clearTimer()
      const fail = (message: string, permission = 'unknown') => {
        const detail = String(err.message ?? '').replace(/\s+/g, ' ').slice(0, 300)
        rejectRequest(new LocationError(message, `code=${err.code}; permission=${permission}; detail=${detail || '(empty)'}`))
      }
      if (err.code === 1) {
        const permission = await getBrowserLocationPermission()
        if (settled || requestAttempt !== attempt || version !== errorVersion) return
        const systemDenied = /denied.*(?:system|\bos\b)|(?:system|\bos\b).*denied/i.test(err.message)
        // Observed locally: a single call reports denial, then success 1.4s later.
        // With granted permission, allow that response before retrying or failing.
        // Confirmed permission/system denials remain immediate terminal errors.
        if (!systemDenied && permission === 'granted') {
          timer = setTimeout(() => {
            if (!retried) locate(true)
            else fail('Trang đã được cấp quyền nhưng trình duyệt vẫn không truy cập được vị trí. Kiểm tra dịch vụ vị trí và quyền của trình duyệt trong Cài đặt thiết bị.', permission)
          }, 3000)
          return
        }
        if (!retried && !systemDenied && permission !== 'denied') {
          timer = setTimeout(() => locate(true), 800)
          return
        }
        if (systemDenied) {
          fail('Hệ điều hành đang chặn vị trí. Kiểm tra dịch vụ vị trí và quyền vị trí của trình duyệt trong Cài đặt thiết bị.', permission)
        } else {
          fail('Vị trí đang bị chặn. Kiểm tra quyền vị trí của trang, trình duyệt và thiết bị.', permission)
        }
        return
      }
      if (!retried && (err.code === 2 || err.code === 3)) {
        locate(true)
        return
      }
      fail(err.code === 2
        ? 'Không xác định được vị trí. Hãy bật dịch vụ vị trí trên thiết bị hoặc thử lại.'
        : err.code === 3 ? 'Lấy vị trí quá lâu, vui lòng thử lại.' : 'Không lấy được vị trí. Vui lòng thử lại.')
    }
    const locate = (retried: boolean) => {
      if (settled) return
      clearTimer()
      const requestAttempt = ++attempt
      try {
        navigator.geolocation.getCurrentPosition(succeed, err => {
          void handleError(err, retried, requestAttempt).catch(error => {
            if (requestAttempt === attempt) rejectRequest(error)
          })
        }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 })
      } catch { rejectRequest(new Error('Trình duyệt không cho phép truy cập vị trí. Kiểm tra quyền vị trí của trang và thiết bị.')) }
    }
    locate(false)
  })
  pendingPosition = request.finally(() => { pendingPosition = null })
  return pendingPosition
}
