import type { ContentfulStatusCode } from 'hono/utils/http-status'

export class ProviderError extends Error {
  status: ContentfulStatusCode
  code: string
  publicMessage: string
  retryAfter?: string
  responseHeaders?: Record<string, string>

  constructor(
    message: string,
    status: ContentfulStatusCode,
    code = 'provider_error',
    publicMessage = message,
    retryAfter?: string,
    responseHeaders?: Record<string, string>
  ) {
    super(message)
    this.name = 'ProviderError'
    this.status = status
    this.code = code
    this.publicMessage = publicMessage
    this.retryAfter = retryAfter
    this.responseHeaders = responseHeaders
  }
}
