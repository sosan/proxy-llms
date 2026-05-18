import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { ProviderConfig, GenericPayload, Env } from '../interfaces/general'
import type { AIProvider } from '../interfaces/provider'
import { ProviderError } from '../errors/provider-error'
import { resolveModel, ModelDefaultsById } from '../config/providers'
import { logger } from '../utils/logger'

const DEFAULT_MAX_TOKENS = 32768
const DEFAULT_MAX_TEMP = 1
const DEFAULT_MAX_TOP_P = 1
const DEFAULT_IS_STREAMING = false
const ROUTING_PAYLOAD_KEYS = new Set(['provider', 'model', 'messages', 'content'])

/**
 * Base provider class with shared logic for all AI providers.
 * Specific providers extend this and override provider-specific methods.
 */
export abstract class BaseProvider implements AIProvider {
  abstract readonly name: string
  protected apiKey: string
  protected baseUrl: string
  protected readonly responseTimeoutMs = 980_000

  constructor(apiKey: string, baseUrl: string) {
    this.apiKey = apiKey
    this.baseUrl = baseUrl
  }

  // ─── Shared helpers ───────────────────────────────────────────────────────

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
    const retryAfter = response.headers.get('retry-after') ?? undefined
    const upstreamMessage = this.extractUpstreamMessage(errorBody)

    if (response.status === 429) {
      const retryHint = retryAfter ? ` Retry after ${retryAfter} seconds.` : ''
      return new ProviderError(
        `${providerName} API rate limited the request: ${JSON.stringify(errorBody)}`,
        429 as ContentfulStatusCode,
        'upstream_rate_limited',
        `${providerName} rate limit reached. Wait a bit before retrying.${retryHint}`,
        retryAfter
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
      retryAfter
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

  // ─── Abstract methods (must be implemented by subclasses) ───────────────

  abstract makeRequest(endpoint: string, payload: unknown, configFormat: string): Promise<unknown>
  abstract makeStreamRequest(endpoint: string, payload: unknown): Promise<Response>

  // ─── Shared transformRequest (can be overridden) ──────────────────────────

  transformRequest(payload: GenericPayload, config: ProviderConfig): unknown {
    const model = resolveModel(config, payload.model)
    const modelDefaults = ModelDefaultsById[model] ?? {}

    let messages: import('../interfaces/general').ChatMessage[] = []
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
      ...modelDefaults.extra,
      model: model,
      messages: messages,
      temperature: payload.temperature ?? modelDefaults.temperature ?? DEFAULT_MAX_TEMP,
      top_p: payload.top_p ?? modelDefaults.top_p ?? DEFAULT_MAX_TOP_P,
      max_tokens: payload.max_tokens ?? modelDefaults.max_tokens ?? DEFAULT_MAX_TOKENS,
      stream: payload.stream ?? modelDefaults.stream ?? DEFAULT_IS_STREAMING,
    }

    for (const [key, value] of Object.entries(payload)) {
      if (ROUTING_PAYLOAD_KEYS.has(key) || value === undefined) continue
      commonPayload[key] = value
    }

    return commonPayload
  }
}
