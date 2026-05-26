import { describe, it, expect } from 'vitest'
import { getUserFacingErrorMessage, formatUserErrorPreview, appendRequestId } from '../../utils/error-formatter'
import { ProviderError } from '../../errors/provider-error'

describe('error-formatter', () => {
  describe('getUserFacingErrorMessage', () => {
    it('should return rate limit message for 429', () => {
      const err = new ProviderError('Rate limited', 429, 'upstream_rate_limited', 'Rate limit')
      expect(getUserFacingErrorMessage(err)).toBe('Provider rate limit reached. Please retry shortly.')
    })

    it('should return auth message for 401', () => {
      const err = new ProviderError('Auth failed', 401, 'upstream_error', 'Auth failed')
      expect(getUserFacingErrorMessage(err)).toBe('Provider authentication failed. Check API key.')
    })

    it('should return bad request message for 400', () => {
      const err = new ProviderError('Bad request', 400, 'upstream_error', 'Bad request')
      expect(getUserFacingErrorMessage(err)).toBe('Invalid request sent to provider.')
    })

    it('should return unavailable message for 502', () => {
      const err = new ProviderError('Bad Gateway', 502, 'upstream_error', 'Bad Gateway')
      expect(getUserFacingErrorMessage(err)).toBe('Provider is temporarily unavailable. Please retry.')
    })

    it('should return unavailable message for 503', () => {
      const err = new ProviderError('Service Unavailable', 503, 'upstream_error', 'Unavailable')
      expect(getUserFacingErrorMessage(err)).toBe('Provider is temporarily unavailable. Please retry.')
    })

    it('should return unavailable message for 504', () => {
      const err = new ProviderError('Gateway Timeout', 504, 'upstream_error', 'Timeout')
      expect(getUserFacingErrorMessage(err)).toBe('Provider is temporarily unavailable. Please retry.')
    })

    it('should fallback to error.message for unknown ProviderError status', () => {
      const err = new ProviderError('Something weird', 418, 'upstream_error', 'Weird')
      expect(getUserFacingErrorMessage(err)).toBe('Something weird')
    })

    it('should detect upstream_timeout code on generic Error', () => {
      const err = new Error('Timeout') as Error & { code: string }
      ;(err as unknown as Record<string, unknown>).code = 'upstream_timeout'
      expect(getUserFacingErrorMessage(err)).toBe('Provider request timed out.')
    })

    it('should detect upstream_network_error code', () => {
      const err = new Error('Network') as Error & { code: string }
      ;(err as unknown as Record<string, unknown>).code = 'upstream_network_error'
      expect(getUserFacingErrorMessage(err)).toBe('Could not connect to provider.')
    })

    it('should fallback to original message for generic errors', () => {
      const err = new Error('Custom error')
      expect(getUserFacingErrorMessage(err)).toBe('Custom error')
    })

    it('should return fallback for empty message', () => {
      const err = new Error('')
      expect(getUserFacingErrorMessage(err)).toBe('Provider request failed unexpectedly.')
    })
  })

  describe('formatUserErrorPreview', () => {
    it('should truncate long messages', () => {
      const err = new ProviderError('A'.repeat(300), 429, 'upstream_rate_limited', 'Rate limit')
      expect(formatUserErrorPreview(err)).toBe('Provider rate limit reached. Please retry shortly.')
    })

    it('should respect maxLen', () => {
      const err = new ProviderError('Rate limited', 429, 'upstream_rate_limited', 'Rate limit')
      expect(formatUserErrorPreview(err, 10)).toBe('Provider r')
    })
  })

  describe('appendRequestId', () => {
    it('should append request_id when provided', () => {
      expect(appendRequestId('Error', 'abc123')).toBe('Error (request_id=abc123)')
    })

    it('should not append when requestId is null', () => {
      expect(appendRequestId('Error', null)).toBe('Error')
    })

    it('should not append when requestId is undefined', () => {
      expect(appendRequestId('Error')).toBe('Error')
    })

    it('should use fallback message for empty input', () => {
      expect(appendRequestId('', 'abc123')).toBe('Provider request failed unexpectedly. (request_id=abc123)')
    })
  })
})
