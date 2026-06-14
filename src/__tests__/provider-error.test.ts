import { describe, it, expect } from 'vitest'
import { ProviderError } from '../errors/provider-error'

describe('ProviderError', () => {
  it('should create a ProviderError with all properties', () => {
    const error = new ProviderError(
      'NVIDIA API returned 500: Internal Server Error',
      500,
      'upstream_error',
      'NVIDIA returned error 500.',
      { 'Retry-After': '60' }
    )

    expect(error).toBeInstanceOf(ProviderError)
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('NVIDIA API returned 500: Internal Server Error')
    expect(error.status).toBe(500)
    expect(error.code).toBe('upstream_error')
    expect(error.publicMessage).toBe('NVIDIA returned error 500.')
    expect(error.responseHeaders?.['Retry-After']).toBe('60')
    expect(error.name).toBe('ProviderError')
  })

  it('should use default values for optional parameters', () => {
    const error = new ProviderError(
      'Some error occurred',
      400
    )

    expect(error.message).toBe('Some error occurred')
    expect(error.status).toBe(400)
    expect(error.code).toBe('provider_error')
    expect(error.publicMessage).toBe('Some error occurred')
    expect(error.responseHeaders?.['Retry-After']).toBeUndefined()
  })

  it('should handle rate limit (429) error', () => {
    const error = new ProviderError(
      'Rate limit exceeded',
      429,
      'upstream_rate_limited',
      'Too many requests',
      { 'Retry-After': '120' },
    )

    expect(error.status).toBe(429)
    expect(error.code).toBe('upstream_rate_limited')
    expect(error.responseHeaders?.['Retry-After']).toBe('120')
  })

  it('should handle timeout error', () => {
    const error = new ProviderError(
      'Request timed out',
      504,
      'upstream_timeout',
      'The upstream server timed out.'
    )

    expect(error.status).toBe(504)
    expect(error.code).toBe('upstream_timeout')
  })

  it('should be throwable and catchable', () => {
    expect(() => {
      throw new ProviderError('Test error', 500)
    }).toThrow(ProviderError)
  })

  it('should have a stack trace', () => {
    const error = new ProviderError('Test error', 500)
    expect(error.stack).toBeDefined()
  })
})
