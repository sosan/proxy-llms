import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { ProviderError } from '../errors/provider-error'
import { ReservationResponse } from '../interfaces/provider'

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function hashNvidiaApiKey(apiKey: string): Promise<string> {
  const data = new TextEncoder().encode(apiKey)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return toHex(digest)
}

export function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {}
  headers.forEach((value, key) => {
    record[key] = value
  })
  return record
}

export function throwRateLimited(reservation: ReservationResponse, responseHeaders?: Headers): never {
  const headers = {
    ...(responseHeaders ? headersToRecord(responseHeaders) : {}),
    ...reservation.headers,
  }
  const retryAfter = reservation.retryAfter ?? headers['Retry-After'] ?? headers['retry-after']

  throw new ProviderError(
    'NVIDIA rate gate queue is full',
    429 as ContentfulStatusCode,
    'upstream_rate_limited',
    'NVIDIA rate limit queue is full. Retry after the indicated delay.',
    retryAfter,
    headers
  )
}
