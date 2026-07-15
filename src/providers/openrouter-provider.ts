import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { BaseProvider, sleep, getRetryDelay, RETRY_MAX_ATTEMPTS, isNetworkError } from './base-provider'
import { ProviderError } from '../errors/provider-error'
import { ProviderConfigs } from '../config/providers'
import { logger } from '../utils/logger'

// ---------------------------------------------------------------------------
// Helpers: rate-limit header normalization
// ---------------------------------------------------------------------------

function parseRetryAfterMs(retryAfter: string): number | undefined {
  const seconds = Number(retryAfter)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000
  }

  const retryAt = Date.parse(retryAfter)
  if (Number.isNaN(retryAt)) return undefined

  return Math.max(0, retryAt - Date.now())
}

function getRateLimitDelayMs(provider: string): number {
  return ProviderConfigs[provider]?.rateLimit?.rateLimitDelayMs ?? 600000
}

function getRetryAfterSeconds(provider: string): string {
  return String(Math.ceil(getRateLimitDelayMs(provider) / 1000))
}

function normalizeRetryAfterSeconds(retryAfter: string, provider: string): string {
  if (!retryAfter) return getRetryAfterSeconds(provider)

  const retryAfterMs = parseRetryAfterMs(retryAfter)
  if (retryAfterMs === undefined) return retryAfter

  return String(Math.ceil(retryAfterMs / 1000))
}

function withRateLimitHeaders(error: ProviderError, provider: string): ProviderError {
  if (error.status !== 429) return error

  const rt = error.responseHeaders?.['Retry-After'] ?? error.responseHeaders?.['retry-after']
  if (!rt) return error
  const retryAfter = normalizeRetryAfterSeconds(rt, provider)
  if (!retryAfter) return error

  const requestsPerMinute = ProviderConfigs[provider]?.rateLimit?.requestsPerMinute
  const resetAtSeconds = Math.ceil(Date.now() / 1000) + Number(retryAfter)

  error.responseHeaders = {
    ...error.responseHeaders,
    'Retry-After': retryAfter,
    'RateLimit-Reset': String(resetAtSeconds),
    'X-RateLimit-Remaining': '0',
    'X-RateLimit-Reset': String(resetAtSeconds),
    'X-RateLimit-Delay-Ms': String(Number(retryAfter) * 1000),
    ...(requestsPerMinute ? { 'X-RateLimit-Limit': String(requestsPerMinute) } : {}),
  }

  return error
}

/**
 * OpenRouter Provider
 * Forwards requests to OpenRouter API (openrouter.ai)
 * OpenRouter uses an OpenAI-compatible API
 */
export class OpenRouterProvider extends BaseProvider {
  readonly name = 'openrouter'

  // Shared retry logic with exponential backoff and jitter
  private async executeWithRetry<T>(
    requestId: string,
    operation: () => Promise<T>,
    isRetryable: (err: ProviderError) => boolean
  ): Promise<T> {
    let lastError: ProviderError | null = null

    for (let attempt = 1; attempt <= RETRY_MAX_ATTEMPTS; attempt++) {
      try {
        return await operation()
      } catch (err) {
        lastError = err instanceof ProviderError ? err : null
        if (!lastError && isNetworkError(err)) {
          const networkErr = new ProviderError(
            `Network error: ${err instanceof Error ? err.message : 'unknown'}`,
            504 as ContentfulStatusCode,
            'upstream_network_error',
            'Network connection lost. Retrying the request.'
          )
          lastError = networkErr
        }
        if (!lastError || !isRetryable(lastError)) {
          throw err
        }

        if (attempt === RETRY_MAX_ATTEMPTS) {
          logger.warn(`[${requestId}] Max retry attempts reached, propagating error`)
          throw lastError
        }

        const retryAfterMs = lastError.status === 429 && lastError.responseHeaders?.['Retry-After']
          ? parseRetryAfterMs(lastError.responseHeaders['Retry-After'])
          : undefined
        const rateLimitDelayMs = getRateLimitDelayMs(this.name)
        const delay = retryAfterMs ?? getRetryDelay(
          attempt,
          lastError.status,
          lastError.status === 429 && typeof rateLimitDelayMs === 'number' ? rateLimitDelayMs : 0
        )
        logger.info(`[${requestId}] Retrying after ${Math.round(delay)}ms (attempt ${attempt}/${RETRY_MAX_ATTEMPTS})`)
        await sleep(delay)
      }
    }

    throw lastError ?? new Error('Unknown error during retry')
  }

  async makeStreamRequest(endpoint: string, payload: unknown): Promise<Response> {
    const requestId = crypto.randomUUID().slice(0, 8)
    const uri = `${this.baseUrl}${endpoint}`

    logger.info(`[${requestId}] → Stream request`, {
      uri,
      model: (payload as Record<string, unknown>).model,
    })
    logger.logUpstreamConfig(requestId, payload)

    return this.executeWithRetry(
      requestId,
      async () => this._doStreamRequest(requestId, uri, payload),
      (err) => err.status === 408 || err.status === 502 || err.status === 503 || err.status === 504
    )
  }

  private async _doStreamRequest(requestId: string, uri: string, payload: unknown): Promise<Response> {
    const timeout = this.createAbortTimeout(requestId)
    let response: Response
    try {
      response = await fetch(uri, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://proxy-llms.local',
          'X-Title': 'Proxy LLMs',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(payload),
        signal: timeout.signal,
      })
    } catch (err) {
      timeout.clear()
      if (err instanceof Error && err.name === 'AbortError') {
        logger.error(`[${requestId}] ✘ Timeout — OpenRouter did not respond in time`)
        throw new ProviderError(
          'OpenRouter did not send a response before the proxy timeout',
          504 as ContentfulStatusCode,
          'upstream_timeout',
          'OpenRouter took too long to respond. Retry the request or try a faster model.'
        )
      }
      logger.error(`[${requestId}] ✘ Network error`, { error: err instanceof Error ? err.message : err })
      throw new ProviderError(
        `Network error while contacting OpenRouter: ${err instanceof Error ? err.message : 'unknown'}`,
        502 as ContentfulStatusCode,
        'upstream_network_error',
        'Could not connect to OpenRouter. Retry the request in a few seconds.'
      )
    }

    timeout.clear()

    logger.info(`[${requestId}] ← Upstream response`, {
      status: response.status,
      contentType: response.headers.get('content-type'),
    })

    if (!response.ok) {
      const errorBody = await this.readErrorBody(response)
      logger.error(`[${requestId}] ✘ Upstream error`, {
        status: response.status,
        retryAfter: response.headers.get('retry-after'),
        body: errorBody,
      })
      throw withRateLimitHeaders(this.createUpstreamError(response, errorBody, this.name), this.name)
    }

    return response
  }

  async makeRequest(endpoint: string, payload: unknown, _configFormat: string): Promise<unknown> {
    const requestId = crypto.randomUUID().slice(0, 8)
    const uri = `${this.baseUrl}${endpoint}`

    logger.info(`[${requestId}] → Request`, {
      uri,
      model: (payload as Record<string, unknown>).model,
      messages: ((payload as Record<string, unknown>).messages as unknown[])?.length ?? 0,
    })
    logger.logUpstreamConfig(requestId, payload)

    return this.executeWithRetry(
      requestId,
      async () => this._doRequest(requestId, uri, payload),
      (err) => err.status === 408 || err.status === 502 || err.status === 503 || err.status === 504
    )
  }

  private async _doRequest(requestId: string, uri: string, payload: unknown): Promise<unknown> {
    const timeout = this.createAbortTimeout(requestId)
    let response: Response
    try {
      response = await fetch(uri, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://proxy-llms.local',
          'X-Title': 'Proxy LLMs',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(payload),
        signal: timeout.signal,
      })
      timeout.clear()

      logger.info(`[${requestId}] ← Response received`, {
        status: response.status,
        contentType: response.headers.get('content-type'),
      })

      if (!response.ok) {
        const errorBody = await this.readErrorBody(response)
        logger.error(`[${requestId}] ✘ Server error`, {
          status: response.status,
          retryAfter: response.headers.get('retry-after'),
          body: errorBody,
        })
        throw withRateLimitHeaders(this.createUpstreamError(response, errorBody, this.name), this.name)
      }

      const json = await response.json()

      logger.info(`[${requestId}] ✔ Completed`, {
        finish_reason: ((json as Record<string, unknown>).choices as Array<{ finish_reason?: string }>)?.[0]?.finish_reason,
      })
      return json
    } catch (err) {
      timeout.clear()
      if (err instanceof Error && err.name === 'AbortError') {
        logger.error(`[${requestId}] ✘ Timeout — OpenRouter did not respond in time`)
        throw new ProviderError(
          'OpenRouter did not send a response before the proxy timeout',
          504 as ContentfulStatusCode,
          'upstream_timeout',
          'OpenRouter took too long to respond. Retry the request or try a faster model.'
        )
      }
      if (err instanceof ProviderError) throw err
      logger.error(`[${requestId}] ✘ Network error`, { error: err instanceof Error ? err.message : err })
      throw new ProviderError(
        `Network error while contacting OpenRouter: ${err instanceof Error ? err.message : 'unknown'}`,
        502 as ContentfulStatusCode,
        'upstream_network_error',
        'Could not connect to OpenRouter. Retry the request in a few seconds.'
      )
    }
  }
}
