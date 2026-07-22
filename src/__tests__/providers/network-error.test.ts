import { describe, it, expect } from 'vitest'
import { isNetworkError } from '../../providers/base-provider'

describe('isNetworkError', () => {
  it('returns false for non-Error values', () => {
    expect(isNetworkError(null)).toBe(false)
    expect(isNetworkError('internal error')).toBe(false)
    expect(isNetworkError(undefined)).toBe(false)
  })

  it('detects standard network failures', () => {
    expect(isNetworkError(new Error('fetch failed'))).toBe(true)
    expect(isNetworkError(new Error('ECONNRESET'))).toBe(true)
    expect(isNetworkError(new Error('ETIMEDOUT'))).toBe(true)
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
  })

  it('detects workerd internal errors (jsgInternalError)', () => {
    expect(isNetworkError(new Error('internal error; reference = abc123'))).toBe(true)
  })

  it('detects DNS resolution failures', () => {
    expect(isNetworkError(new Error('DNS lookup failed.; params.host = integrate.api.nvidia.com'))).toBe(true)
    expect(isNetworkError(new Error("Name or service not known"))).toBe(true)
    expect(isNetworkError(new Error('failed to resolve host example.com'))).toBe(true)
  })
})
