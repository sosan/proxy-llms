import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { Env } from '../interfaces/general'
import { ProviderError } from '../errors/provider-error'

type ReservationResponse = {
  allowed?: boolean
  delayMs?: number
  scheduledAt?: number
  retryAfter?: string
  headers?: Record<string, string>
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function hashNvidiaApiKey(apiKey: string): Promise<string> {
  const data = new TextEncoder().encode(apiKey)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return toHex(digest)
}

function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {}
  headers.forEach((value, key) => {
    record[key] = value
  })
  return record
}

function throwRateLimited(reservation: ReservationResponse, responseHeaders?: Headers): never {
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

export async function waitForNvidiaRateLimit(env: Env): Promise<void> {
  const bucket = await hashNvidiaApiKey(env.NVIDIA_API_KEY)
  const limiter = env.NVIDIA_RATE_LIMITER.getByName(bucket)
  const response = await limiter.fetch('https://internal/reserve', { method: 'POST' })
  const reservation = await response.json<ReservationResponse>().catch(() => ({}))

  if (!response.ok || reservation.allowed === false) {
    throwRateLimited(reservation, response.headers)
  }

  const delayMs = typeof reservation.delayMs === 'number' ? reservation.delayMs : 0
  if (delayMs > 0) {
    await wait(delayMs)
  }
}
