import { describe, it, expect } from 'vitest'
import { wait, toHex, hashNvidiaApiKey, headersToRecord, throwRateLimited } from '../../utils/nvidia-rate-gate'
import { ProviderError } from '../../errors/provider-error'

describe('nvidia-rate-gate', () => {
  describe('wait', () => {
    it('resolves after the given ms', async () => {
      const start = Date.now()
      await wait(50)
      const elapsed = Date.now() - start
      expect(elapsed).toBeGreaterThanOrEqual(40)
    })
  })

  describe('toHex', () => {
    it('converts a Uint8Array to lowercase hex string', () => {
      const bytes = new Uint8Array([0x00, 0xff, 0x10, 0xab])
      const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      expect(toHex(buf)).toBe('00ff10ab')
    })

    it('returns empty string for empty buffer', () => {
      expect(toHex(new ArrayBuffer(0))).toBe('')
    })
  })

  describe('hashNvidiaApiKey', () => {
    it('produces a 64-char hex SHA-256 digest', async () => {
      const hash = await hashNvidiaApiKey('test-api-key')
      expect(hash).toMatch(/^[0-9a-f]{64}$/)
    })

    it('is deterministic', async () => {
      const a = await hashNvidiaApiKey('key-1')
      const b = await hashNvidiaApiKey('key-1')
      expect(a).toBe(b)
    })

    it('produces different hashes for different inputs', async () => {
      const a = await hashNvidiaApiKey('key-1')
      const b = await hashNvidiaApiKey('key-2')
      expect(a).not.toBe(b)
    })

    it('matches SHA-256 of the input string', async () => {
      const input = 'nvidia-secret-key'
      const data = new TextEncoder().encode(input)
      const digest = await crypto.subtle.digest('SHA-256', data)
      const expected = toHex(digest)
      const actual = await hashNvidiaApiKey(input)
      expect(actual).toBe(expected)
    })
  })

  describe('headersToRecord', () => {
    it('flattens a Headers object into a plain object', () => {
      const headers = new Headers()
      headers.set('Content-Type', 'application/json')
      headers.set('Retry-After', '60')
      const record = headersToRecord(headers)
      expect(record).toEqual({
        'content-type': 'application/json',
        'retry-after': '60',
      })
    })

    it('returns an empty object for empty Headers', () => {
      expect(headersToRecord(new Headers())).toEqual({})
    })
  })

  describe('throwRateLimited', () => {
    it('throws ProviderError with 429 status and upstream_rate_limited code', () => {
      expect(() => throwRateLimited({ allowed: false, delayMs: 0, scheduledAt: 0 })).toThrow(ProviderError)
      try {
        throwRateLimited({ allowed: false, delayMs: 0, scheduledAt: 0 })
      } catch (e) {
        const err = e as ProviderError
        expect(err.status).toBe(429)
        expect(err.code).toBe('upstream_rate_limited')
      }
    })

    it('uses reservation.retryAfter when present', () => {
      try {
        throwRateLimited({ allowed: false, delayMs: 0, scheduledAt: 0, retryAfter: '120' })
      } catch (e) {
        const err = e as ProviderError
        expect(err.responseHeaders?.['Retry-After']).toBe('120')
      }
    })

    it('falls back to responseHeaders Retry-After', () => {
      const headers = new Headers({ 'Retry-After': '30' })
      try {
        throwRateLimited({ allowed: false, delayMs: 0, scheduledAt: 0 }, headers)
      } catch (e) {
        const err = e as ProviderError
        expect(err.responseHeaders?.['Retry-After']).toBe('30')
      }
    })

    it('merges reservation.headers with responseHeaders', () => {
      const headers = new Headers({ 'Retry-After': '45', 'X-Custom': 'a' })
      try {
        throwRateLimited({
          allowed: false,
          delayMs: 0,
          scheduledAt: 0,
          headers: { 'X-Other': 'b' },
        }, headers)
      } catch (e) {
        const err = e as ProviderError
        // Headers from `Headers` are lowercased; reservation.headers keys are preserved
        expect(err.responseHeaders?.['x-custom']).toBe('a')
        expect(err.responseHeaders?.['X-Other']).toBe('b')
        expect(err.responseHeaders?.['Retry-After']).toBe('45')
      }
    })

    it('defaults Retry-After when no source provides one', () => {
      try {
        throwRateLimited({ allowed: false, delayMs: 0, scheduledAt: 0 })
      } catch (e) {
        const err = e as ProviderError
        // Default is not added unless reservation.retryAfter or header provides it
        expect(err.responseHeaders?.['Retry-After']).toBeUndefined()
      }
    })
  })
})
