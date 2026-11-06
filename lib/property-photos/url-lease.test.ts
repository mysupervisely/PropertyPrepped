import { describe, expect, it, vi } from 'vitest'
import { createPhotoUrlLease, PHOTO_URL_REFRESH_MS } from './url-lease'

describe('Private photo viewing links', () => {
  it('renews before expiry after the app returns from the background', async () => {
    let time = 0
    const sign = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('renewed')
    const show = vi.fn()
    const lease = createPhotoUrlLease({ sign, show, now: () => time })
    await lease.renew()
    time = PHOTO_URL_REFRESH_MS - 1
    await lease.resume()
    expect(sign).toHaveBeenCalledTimes(1)
    time = 8 * 60 * 60 * 1000
    await lease.resume()
    expect(show).toHaveBeenLastCalledWith('renewed')
  })
  it('recovers a failed image using a fresh link and bounds permanent failures', async () => {
    const sign = vi.fn().mockResolvedValue('fresh')
    const show = vi.fn()
    const lease = createPhotoUrlLease({ sign, show })
    await lease.renew()
    await lease.imageError()
    await lease.imageError()
    expect(sign).toHaveBeenCalledTimes(2)
    expect(show).toHaveBeenLastCalledWith(undefined)
    lease.imageLoaded()
    await lease.imageError()
    expect(sign).toHaveBeenCalledTimes(3)
  })
  it('coalesces simultaneous timer, resume, and image failure requests', async () => {
    let finish!: (url: string) => void
    const sign = vi.fn(() => new Promise<string>(resolve => { finish = resolve }))
    const show = vi.fn()
    const lease = createPhotoUrlLease({ sign, show })
    const first = lease.renew()
    const resumed = lease.resume()
    const errored = lease.imageError()
    expect(sign).toHaveBeenCalledTimes(1)
    finish('fresh')
    await Promise.all([first, resumed, errored])
    expect(show).toHaveBeenCalledTimes(1)
  })
  it('retries signing failures on resume and ignores completions after disposal', async () => {
    const show = vi.fn()
    const sign = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue('fresh')
    const lease = createPhotoUrlLease({ sign, show })
    await lease.renew()
    expect(show).toHaveBeenLastCalledWith(undefined)
    await lease.resume()
    expect(show).toHaveBeenLastCalledWith('fresh')
    const pending = lease.renew()
    lease.dispose()
    show.mockClear()
    await pending
    expect(show).not.toHaveBeenCalled()
    await lease.renew()
    expect(sign).toHaveBeenCalledTimes(3)
  })
})
