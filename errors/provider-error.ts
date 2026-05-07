import type { ContentfulStatusCode } from 'hono/utils/http-status'

export class ProviderError extends Error {
  status: ContentfulStatusCode

  constructor(message: string, status: ContentfulStatusCode) {
    super(message)
    this.name = 'ProviderError'
    this.status = status
  }
}
