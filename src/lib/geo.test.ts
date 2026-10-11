import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getCurrentPosition } from './geo'
import { getLocationDiagnostic } from './browserPosition'

const locate = vi.fn<Geolocation['getCurrentPosition']>()
const query = vi.fn()
const position = { coords: { latitude: 10, longitude: 106 } } as GeolocationPosition
const gpsError = (code: number) => ({ code } as GeolocationPositionError)

beforeEach(() => {
  locate.mockReset()
  query.mockReset().mockResolvedValue({ state: 'denied' })
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: locate }, permissions: { query } })
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

it('shares a pending request but fetches a new fix after it finishes', async () => {
  const first = getCurrentPosition()
  expect(getCurrentPosition()).toBe(first)
  expect(locate).toHaveBeenCalledTimes(1)
  expect(locate.mock.calls[0][2]).toEqual({ enableHighAccuracy: true, timeout: 20000, maximumAge: 0 })
  locate.mock.calls[0][0](position)
  await expect(first).resolves.toBe(position)
  const fresh = getCurrentPosition()
  expect(locate).toHaveBeenCalledTimes(2)
  locate.mock.calls[1][0](position)
  await fresh
})

it.each([2, 3])('retries transient error %s before reporting failure', async code => {
  const request = getCurrentPosition()
  locate.mock.calls[0][1]?.(gpsError(code))
  expect(locate).toHaveBeenCalledTimes(2)
  locate.mock.calls[1][0](position)
  await expect(request).resolves.toBe(position)
})

it('does not retry denied permission and allows a later user request', async () => {
  const request = getCurrentPosition()
  locate.mock.calls[0][1]?.(gpsError(1))
  await expect(request).rejects.toThrow('Vị trí đang bị chặn')
  expect(locate).toHaveBeenCalledTimes(1)
  const retry = getCurrentPosition()
  locate.mock.calls[1][0](position)
  await expect(retry).resolves.toBe(position)
})

it('recovers once when the browser reports denial while permission is granted', async () => {
  vi.useFakeTimers()
  query.mockResolvedValue({ state: 'granted' })
  const request = getCurrentPosition()
  locate.mock.calls[0][1]?.(gpsError(1))
  await vi.advanceTimersByTimeAsync(3000)
  expect(locate).toHaveBeenCalledTimes(2)
  locate.mock.calls[1][0](position)
  await expect(request).resolves.toBe(position)
})

it('does not blame a user who has granted permission when the browser still denies GPS', async () => {
  vi.useFakeTimers()
  query.mockResolvedValue({ state: 'granted' })
  const request = getCurrentPosition()
  const rejection = expect(request).rejects.toThrow('Trang đã được cấp quyền')
  locate.mock.calls[0][1]?.(gpsError(1))
  await vi.advanceTimersByTimeAsync(3000)
  locate.mock.calls[1][1]?.(gpsError(1))
  await vi.advanceTimersByTimeAsync(3000)
  await rejection
  expect(locate).toHaveBeenCalledTimes(2)
})

it('does not retry when the browser explicitly reports a system denial', async () => {
  query.mockResolvedValue({ state: 'granted' })
  const request = getCurrentPosition()
  locate.mock.calls[0][1]?.({ code: 1, message: 'User denied Geolocation: denied by system' } as GeolocationPositionError)
  await expect(request).rejects.toThrow('Hệ điều hành đang chặn vị trí')
  expect(locate).toHaveBeenCalledTimes(1)
})

it('stops after one retry when GPS remains unavailable', async () => {
  const request = getCurrentPosition()
  locate.mock.calls[0][1]?.(gpsError(2))
  locate.mock.calls[1][1]?.(gpsError(2))
  await expect(request).rejects.toThrow('Không xác định được vị trí')
  expect(locate).toHaveBeenCalledTimes(2)
})

it('preserves the browser error details without storing any coordinates', async () => {
  query.mockResolvedValue({ state: 'granted' })
  const request = getCurrentPosition()
  locate.mock.calls[0][1]?.({ code: 1, message: 'Geolocation denied by system' } as GeolocationPositionError)
  const error = await request.catch(error => error)
  expect(getLocationDiagnostic(error)).toBe('code=1; permission=granted; detail=Geolocation denied by system')
  expect(getLocationDiagnostic(new Error('other error'))).toBeNull()
})

it('accepts success after the early denial observed in a single browser call', async () => {
  vi.useFakeTimers()
  query.mockResolvedValue({ state: 'granted' })
  const request = getCurrentPosition()
  await vi.advanceTimersByTimeAsync(7)
  locate.mock.calls[0][1]?.({ code: 1, message: 'User denied Geolocation' } as GeolocationPositionError)
  await vi.advanceTimersByTimeAsync(1418)
  expect(getCurrentPosition()).toBe(request)
  locate.mock.calls[0][0](position)
  await expect(request).resolves.toBe(position)
  await vi.advanceTimersByTimeAsync(10000)
  expect(locate).toHaveBeenCalledTimes(1)
})

it('also waits for a late success on the one permitted retry', async () => {
  vi.useFakeTimers()
  query.mockResolvedValue({ state: 'granted' })
  const request = getCurrentPosition()
  locate.mock.calls[0][1]?.(gpsError(1))
  await vi.advanceTimersByTimeAsync(3000)
  locate.mock.calls[1][1]?.(gpsError(1))
  await vi.advanceTimersByTimeAsync(1425)
  locate.mock.calls[1][0](position)
  await expect(request).resolves.toBe(position)
  await vi.advanceTimersByTimeAsync(10000)
  expect(locate).toHaveBeenCalledTimes(2)
})

it('does not schedule a retry if permission lookup finishes after success', async () => {
  vi.useFakeTimers()
  let finishPermission!: (value: { state: string }) => void
  query.mockReturnValue(new Promise(resolve => { finishPermission = resolve }))
  const request = getCurrentPosition()
  locate.mock.calls[0][1]?.(gpsError(1))
  locate.mock.calls[0][0](position)
  await expect(request).resolves.toBe(position)
  finishPermission({ state: 'granted' })
  await vi.advanceTimersByTimeAsync(10000)
  expect(locate).toHaveBeenCalledTimes(1)
})

it('does not accept a later success after a confirmed permission denial', async () => {
  const request = getCurrentPosition()
  locate.mock.calls[0][1]?.(gpsError(1))
  await expect(request).rejects.toThrow('Vị trí đang bị chặn')
  const next = getCurrentPosition()
  locate.mock.calls[0][0](position)
  expect(getCurrentPosition()).toBe(next)
  const freshPosition = { coords: { latitude: 11, longitude: 107 } } as GeolocationPosition
  locate.mock.calls[1][0](freshPosition)
  await expect(next).resolves.toBe(freshPosition)
})
