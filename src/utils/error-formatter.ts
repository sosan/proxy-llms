import { ProviderError } from '../errors/provider-error'

/**
 * Return a readable, non-empty error message for users.
 * Maps known error types to stable wording before falling back to `String(e)`,
 * so empty or noisy messages do not skip the mapped path.
 */
export function getUserFacingErrorMessage(error: Error): string {
  // ProviderError with known status codes
  if (error instanceof ProviderError) {
    switch (error.status) {
      case 400:
        return 'Invalid request sent to provider.'
      case 401:
        return 'Provider authentication failed. Check API key.'
      case 429:
        return 'Provider rate limit reached. Please retry shortly.'
      case 502:
      case 503:
      case 504:
        return 'Provider is temporarily unavailable. Please retry.'
      default:
        break
    }
  }

  // Named error types (fallback for non-ProviderError or code-based detection)
  const name = error.constructor.name
  if (name === 'AbortError' || name === 'TimeoutError') {
    return 'Provider request timed out.'
  }

  // Specific code-based detection
  const errorWithCode = error as { code?: string }
  const code = errorWithCode.code
  if (code === 'upstream_timeout') {
    return 'Provider request timed out.'
  }
  if (code === 'upstream_network_error') {
    return 'Could not connect to provider.'
  }
  if (code === 'upstream_rate_limited') {
    return 'Provider rate limit reached. Please retry shortly.'
  }

  // Fallback: strip and return original message if non-empty
  const message = error.message?.trim()
  if (message) {
    return message
  }

  return 'Provider request failed unexpectedly.'
}

/**
 * Truncate a user-facing error string for short chat replies.
 */
export function formatUserErrorPreview(error: Error, maxLen = 200): string {
  return getUserFacingErrorMessage(error).slice(0, maxLen)
}

/**
 * Append request_id suffix when available.
 */
export function appendRequestId(message: string, requestId?: string | null): string {
  const base = message.trim() || 'Provider request failed unexpectedly.'
  if (requestId) {
    return `${base} (request_id=${requestId})`
  }
  return base
}
