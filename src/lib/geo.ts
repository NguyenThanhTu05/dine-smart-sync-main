export function haversineMeters(
  lat1: number, lon1: number, lat2: number, lon2: number,
): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      return reject(new Error('Trình duyệt không hỗ trợ GPS'))
    }

    // Thử lần 1: nếu bị denied (Cốc Cốc hỏi quyền async), đợi rồi thử lần 2
    navigator.geolocation.getCurrentPosition(
      resolve,
      () => {
        // Lần 1 thất bại → đợi 800ms cho trình duyệt xử lý quyền → thử lại
        setTimeout(() => {
          navigator.geolocation.getCurrentPosition(
            resolve,
            (err) => {
              switch (err.code) {
                case err.PERMISSION_DENIED:
                  reject(new Error('Bạn chưa cho phép truy cập vị trí. Vào cài đặt trình duyệt để cấp quyền.'))
                  break
                case err.POSITION_UNAVAILABLE:
                  reject(new Error('Không xác định được vị trí. Hãy bật GPS hoặc thử lại.'))
                  break
                case err.TIMEOUT:
                  reject(new Error('Lấy vị trí quá lâu, vui lòng thử lại.'))
                  break
                default:
                  reject(new Error('Lỗi GPS: ' + err.message))
              }
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
          )
        }, 800)
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 },
    )
  })
}
