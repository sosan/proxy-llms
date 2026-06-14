import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { ProviderConfig, GenericPayload, ChatMessage } from '../interfaces/general'
import type { AIProvider } from '../interfaces/provider'
import { ProviderError } from '../errors/provider-error'
import { resolveModel, resolveModelDefaults } from '../config/providers'
import { logger } from '../utils/logger'

const DEFAULT_MAX_TOKENS = 32768
const DEFAULT_MAX_TEMP = 1
const DEFAULT_MAX_TOP_P = 1
const DEFAULT_IS_STREAMING = true
const ROUTING_PAYLOAD_KEYS = new Set(['provider', 'model', 'messages', 'content'])

// Retry configuration for transient upstream failures
const RETRY_MAX_ATTEMPTS = 5
const RETRY_BASE_DELAY_MS = 1000
const RETRY_BASE_DELAY_MS_GATEWAY = 5000
const JITTER_MAX_MS = 500

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function getRetryDelay(attempt: number, status?: number, minRetryDelayMs = 0): number {
  const baseDelay = status === 502 || status === 503 || status === 504 ? RETRY_BASE_DELAY_MS_GATEWAY : RETRY_BASE_DELAY_MS
  const base = baseDelay * 2 ** (attempt - 1)
  const jitter = Math.random() * JITTER_MAX_MS
  const delay = base + jitter
  return Math.max(delay, minRetryDelayMs)
}

export function getRetryDelayWithConfig(attempt: number, rateLimitConfig: { minRetryDelayMs?: number; maxRetryDelayMs?: number } | undefined, status?: number): number {
  const isGateway = status === 502 || status === 503 || status === 504
  const is429 = status === 429
  let baseDelay: number
  if (is429 && rateLimitConfig?.minRetryDelayMs) {
    baseDelay = rateLimitConfig.minRetryDelayMs
  } else if (isGateway) {
    baseDelay = RETRY_BASE_DELAY_MS_GATEWAY
  } else {
    baseDelay = RETRY_BASE_DELAY_MS
  }
  const base = baseDelay * 2 ** (attempt - 1)
  const jitter = Math.random() * JITTER_MAX_MS
  let delay = base + jitter
  if (rateLimitConfig?.maxRetryDelayMs) {
    delay = Math.min(delay, rateLimitConfig.maxRetryDelayMs)
  }
  return delay
}

/**
 * Checks whether an error is a network-level failure that should be retried.
 */
export function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const msg = err.message.toLowerCase()
  return (
    msg.includes('network') ||
    msg.includes('fetch failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('connection lost') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('socket hang up') ||
    msg.includes('aborted') ||
    err.name === 'TypeError'
  )
}

export { RETRY_MAX_ATTEMPTS }

/**
 * Base provider class with shared logic for all AI providers.
 * Specific providers extend this and override provider-specific methods.
 */
export abstract class BaseProvider implements AIProvider {
  abstract readonly name: string
  protected apiKey: string
  protected baseUrl: string
  protected rateLimiter?: DurableObjectNamespace
  protected readonly responseTimeoutMs = 980_000

  constructor(apiKey: string, baseUrl: string, rateLimiter?: DurableObjectNamespace) {
    this.apiKey = apiKey
    this.baseUrl = baseUrl
    this.rateLimiter = rateLimiter
  }

  // --- Shared helpers -------------------------------------------------------

  protected async readErrorBody(response: Response): Promise<unknown> {
    const text = await response.text().catch(() => '')
    if (!text) return '<empty>'
    try { return JSON.parse(text) }
    catch { return text }
  }

  protected createAbortTimeout(requestId: string): { signal: AbortSignal; clear: () => void } {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      logger.warn(`[${requestId}] Timeout reached — aborting request`)
      controller.abort()
    }, this.responseTimeoutMs)

    return {
      signal: controller.signal,
      clear: () => clearTimeout(timeoutId),
    }
  }

  protected createUpstreamError(response: Response, errorBody: unknown, providerName: string): ProviderError {
    const retryAfter = response.headers.get('Retry-After') ?? '60'
    const upstreamMessage = this.extractUpstreamMessage(errorBody)

    if (response.status === 429) {
      const retryHint = retryAfter ? ` Retry after ${retryAfter} seconds.` : ''
      return new ProviderError(
        `${providerName} API rate limited the request: ${JSON.stringify(errorBody)}`,
        429 as ContentfulStatusCode,
        'upstream_rate_limited',
        `${providerName} rate limit reached. Wait a bit before retrying.${retryHint}`,
        { 'Retry-After': retryAfter }
      )
    }

    let publicMessage = `${providerName} returned error ${response.status}.`
    if (upstreamMessage) {
      if (upstreamMessage.includes("is longer than the model's context length")) {
        publicMessage = `Request too long: ${upstreamMessage}. Reduce the number of tokens in your request.`
      } else {
        publicMessage = `${providerName} returned error ${response.status}: ${upstreamMessage}`
      }
    }

    return new ProviderError(
      `${providerName} API returned ${response.status}: ${JSON.stringify(errorBody)}`,
      response.status as ContentfulStatusCode,
      'upstream_error',
      publicMessage,
      { 'Retry-After': retryAfter }
    )
  }

  private extractUpstreamMessage(errorBody: unknown): string | undefined {
    if (errorBody && typeof errorBody === 'object') {
      const body = errorBody as Record<string, unknown>
      if (body.error && typeof body.error === 'object') {
        const errorObj = body.error as Record<string, unknown>
        if (typeof errorObj.message === 'string') {
          return errorObj.message
        }
      }
      if (typeof body.message === 'string') {
        return body.message
      }
    }
    return undefined
  }

  // --- Abstract methods (must be implemented by subclasses) ---------------
  abstract makeRequest(endpoint: string, payload: unknown, configFormat: string): Promise<unknown>
  abstract makeStreamRequest(endpoint: string, payload: unknown): Promise<Response>

  // --- Shared transformRequest (can be overridden) --------------------------

  transformRequest(payload: GenericPayload, config: ProviderConfig): Record<string, unknown> {
    const fullmodel = payload.model //?.substring(payload.model.indexOf('/') + 1)
    if (!fullmodel) {
      logger.warn(`No model found for model "${fullmodel}" in payload: ${JSON.stringify(payload)}. Using provider default model if available.`)
      throw new ProviderError(
        'Model not specified in payload',
        400 as ContentfulStatusCode,
        'model_not_specified',
        'Model must be specified in the request payload.'
      )
    }
    
    const modelWOProvider = resolveModel(config, fullmodel)
    const modelDefaults = resolveModelDefaults(fullmodel)
    if (!modelDefaults) {
      logger.warn(`No model defaults found for model "${fullmodel}". Using generic defaults.`)
    }

    // Apply max_tokens cap when model has instability history
    const maxTokensCap = modelDefaults?.maxTokensCap ?? modelDefaults?.max_tokens

    let messages: ChatMessage[] = []
    if (payload.messages && Array.isArray(payload.messages)) {
      messages = payload.messages
    } else if (typeof payload.content === 'string') {
      messages = [{ role: 'user', content: payload.content }]
    } else if (payload.content && Array.isArray(payload.content)) {
      messages = [{ role: 'user', content: payload.content }]
    }

    if (messages.length === 0 && payload.provider) {
      messages = [{ role: 'user', content: `Default message for ${payload.provider} provider.` }]
    }

    const commonPayload: Record<string, unknown> = {
      ...modelDefaults?.extra,
      model: modelWOProvider,
      messages: messages,
      temperature: payload.temperature ?? modelDefaults?.temperature ?? DEFAULT_MAX_TEMP,
      top_p: payload.top_p ?? modelDefaults?.top_p ?? DEFAULT_MAX_TOP_P,
      max_tokens: Math.min(
        payload.max_tokens ?? modelDefaults?.max_tokens ?? DEFAULT_MAX_TOKENS,
        maxTokensCap ?? DEFAULT_MAX_TOKENS
      ),
      stream: payload.stream ?? modelDefaults?.stream ?? DEFAULT_IS_STREAMING,
    }
    // include any extra fields from payload that are not routing keys and not undefined
    for (const [key, value] of Object.entries(payload)) {
      if (ROUTING_PAYLOAD_KEYS.has(key) || value === undefined) continue
      commonPayload[key] = value
    }

    return commonPayload
  }


}
