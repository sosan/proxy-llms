import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { BaseProvider, sleep, getRetryDelay, RETRY_MAX_ATTEMPTS, isNetworkError } from './base-provider'
import { ProviderError } from '../errors/provider-error'
import { ProviderConfigs } from '../config/providers'
import { logger } from '../utils/logger'
import { hashNvidiaApiKey, throwRateLimited } from '../utils/nvidia-rate-gate'
import { ReservationResponse } from '../interfaces/provider'

// ---------------------------------------------------------------------------
// Helpers: NVIDIA-specific defensive mitigations
// ---------------------------------------------------------------------------

/**
 * Strips parameters known to cause instability on NVIDIA routes.
 */
function sanitizeNvidiaPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload
  const p = payload as Record<string, unknown>
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { frequency_penalty, presence_penalty, logprobs, top_logprobs, seed, ...rest } = p
  return rest
}

/**
 * Checks whether a string contains leaked reasoning tokens.
 */
function hasLeakedReasoning(content: string): boolean {
  if (typeof content !== 'string') return false
  const lower = content.toLowerCase().trimStart()
  return (
    lower.startsWith('<thinking') ||
    lower.startsWith('<reasoning') ||
    lower.startsWith('### thinking') ||
    lower.startsWith('reasoning:') ||
    lower.startsWith('<|thinking|>') ||
    lower.startsWith('<think')
  )
}

/**
 * Validates that a 200 OK response from NVIDIA has usable content.
 * Throws ProviderError when the body is empty, missing choices, or has null content.
 */
function validateOpenAIResponse(json: unknown): void {
  if (!json || typeof json !== 'object') {
    throw new ProviderError(
      'NVIDIA returned empty or invalid JSON',
      422 as ContentfulStatusCode,
      'upstream_malformed_response',
      'NVIDIA returned an empty response. Retry the request or try a different model.'
    )
  }
  const obj = json as Record<string, unknown>
  const choices = obj.choices as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new ProviderError(
      'NVIDIA returned a response with no choices',
      422 as ContentfulStatusCode,
      'upstream_malformed_response',
      'NVIDIA returned an empty response. Retry the request or try a different model.'
    )
  }
  const firstChoice = choices[0]
  const message = firstChoice?.message as Record<string, unknown> | undefined
  const content = message?.content
  if (content === null || content === undefined || content === '') {
    throw new ProviderError(
      'NVIDIA returned a response with empty content',
      422 as ContentfulStatusCode,
      'upstream_malformed_response',
      'NVIDIA returned an empty response. Retry the request or try a different model.'
    )
  }
}

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
 * NVIDIA NIM Provider
 * Forwards requests to NVIDIA's API (api.nvidia.com)
 */
export class NvidiaProvider extends BaseProvider {
  readonly name = 'nvidia'

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

  async makeStreamRequest(endpoint: string, payload: unknown, signal?: AbortSignal): Promise<Response> {
    const requestId = crypto.randomUUID().slice(0, 8)
    const uri = `${this.baseUrl}${endpoint}`
    const sanitizedPayload = sanitizeNvidiaPayload(payload)

    logger.info(`[${requestId}] → Stream request`, {
      uri,
      model: (sanitizedPayload as Record<string, unknown>).model,
    })
    logger.logUpstreamConfig(requestId, sanitizedPayload)

    const token = await this.ensureCooldown().catch((err) => {
      logger.error(`[${requestId}] ✘ Cooldown error`, { error: err instanceof Error ? err.message : err })
      throw err
    })

    return this.executeWithRetry(
      requestId,
      async () => this._doStreamRequest(requestId, uri, sanitizedPayload, signal, token),
      (err) => err.status === 408 || err.status === 502 || err.status === 503 || err.status === 504
    )
  }

  private async _doStreamRequest(
    requestId: string,
    uri: string,
    payload: unknown,
    signal?: AbortSignal,
    token?: string,
  ): Promise<Response> {
    const timeout = this.createAbortTimeout(requestId)
    const abort = this.composeSignals(timeout.signal, signal)
    let response: Response
    try {
      response = await fetch(uri, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: abort.signal,
      })
    } catch (err) {
      timeout.clear()
      await this.releaseCooldown(token)
      if (err instanceof Error && (err.name === 'AbortError' || abort.signal.aborted)) {
        logger.error(`[${requestId}] ✘ Timeout — NVIDIA did not respond in time`)
        throw new ProviderError(
          'NVIDIA did not send a response before the proxy timeout',
          504 as ContentfulStatusCode,
          'upstream_timeout',
          'NVIDIA took too long to respond. Retry the request or try a faster model.'
        )
      }
      logger.error(`[${requestId}] ✘ Network error`, { error: err instanceof Error ? err.message : err })
      throw new ProviderError(
        `Network error while contacting NVIDIA: ${err instanceof Error ? err.message : 'unknown'}`,
        502 as ContentfulStatusCode,
        'upstream_network_error',
        'Could not connect to NVIDIA. Retry the request in a few seconds.'
      )
    }

    timeout.clear()

    logger.info(`[${requestId}] ← Upstream response`, {
      status: response.status,
      contentType: response.headers.get('content-type'),
    })

    if (!response.ok) {
      const errorBody = await this.readErrorBody(response)
      const now = new Date().toISOString()
      logger.error(`[${now}] [${requestId}] ✘ Upstream error`, {
        status: response.status,
        retryAfter: response.headers.get('retry-after'),
        body: errorBody,
      })
      if (response.status === 429) {
        await this.openCircuit()
      }
      await this.releaseCooldown(token)
      throw withRateLimitHeaders(this.createUpstreamError(response, errorBody, this.name), this.name)
    }

    await this.releaseCooldown(token)
    return response
  }

  async makeRequest(endpoint: string, payload: unknown, _configFormat: string, signal?: AbortSignal): Promise<unknown> {
    const requestId = crypto.randomUUID().slice(0, 8)
    const uri = `${this.baseUrl}${endpoint}`
    const sanitizedPayload = sanitizeNvidiaPayload(payload)

    logger.info(`[${requestId}] → Request`, {
      uri,
      model: (sanitizedPayload as Record<string, unknown>).model,
      messages: ((sanitizedPayload as Record<string, unknown>).messages as unknown[])?.length ?? 0,
    })
    logger.logUpstreamConfig(requestId, sanitizedPayload)

    const token = await this.ensureCooldown().catch((err) => {
      logger.error(`[${requestId}] ✘ Cooldown error`, { error: err instanceof Error ? err.message : err })
      throw err
    })

    return this.executeWithRetry(
      requestId,
      async () => this._doRequest(requestId, uri, sanitizedPayload, signal, token),
      (err) => err.status === 400 || err.status === 408 || err.status === 502 || err.status === 503 || err.status === 504
    )
  }

  private async _doRequest(
    requestId: string,
    uri: string,
    payload: unknown,
    signal?: AbortSignal,
    token?: string,
  ): Promise<unknown> {
    const timeout = this.createAbortTimeout(requestId)
    const abort = this.composeSignals(timeout.signal, signal)
    let response: Response
    try {
      response = await fetch(uri, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: abort.signal,
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
        if (response.status === 429) {
          await this.openCircuit()
        }
        throw withRateLimitHeaders(this.createUpstreamError(response, errorBody, this.name), this.name)
      }

      const json = await response.json()

      validateOpenAIResponse(json)

      const message = ((json as Record<string, unknown>).choices as Array<Record<string, unknown>>)?.[0]?.message as Record<string, unknown> | undefined
      const content = message?.content
      if (typeof content === 'string' && hasLeakedReasoning(content)) {
        throw new ProviderError(
          'NVIDIA returned response with leaked reasoning tokens',
          422 as ContentfulStatusCode,
          'upstream_malformed_response',
          'NVIDIA returned a malformed response. Retry the request or try a different model.'
        )
      }

      logger.info(`[${requestId}] ✔ Completed`, {
        finish_reason: ((json as Record<string, unknown>).choices as Array<{ finish_reason?: string }>)?.[0]?.finish_reason,
      })
      return json
    } catch (err) {
      timeout.clear()
      if (err instanceof Error && (err.name === 'AbortError' || abort.signal.aborted)) {
        logger.error(`[${requestId}] ✘ Timeout — NVIDIA did not respond in time`)
        throw new ProviderError(
          'NVIDIA did not send a response before the proxy timeout',
          504 as ContentfulStatusCode,
          'upstream_timeout',
          'NVIDIA took too long to respond. Retry the request or try a faster model.'
        )
      }
      if (err instanceof ProviderError) throw err
      logger.error(`[${requestId}] ✘ Network error`, { error: err instanceof Error ? err.message : err })
      throw new ProviderError(
        `Network error while contacting NVIDIA: ${err instanceof Error ? err.message : 'unknown'}`,
        502 as ContentfulStatusCode,
        'upstream_network_error',
        'Could not connect to NVIDIA. Retry the request in a few seconds.'
      )
    } finally {
      await this.releaseCooldown(token)
    }
  }

  /** Composes the internal timeout signal with the optional client request
   *  signal. Whichever aborts first wins; the returned controller mirrors the
   *  combined state so callers can check `aborted`. */
  private composeSignals(timeoutSignal: AbortSignal, clientSignal?: AbortSignal): AbortController {
    const controller = new AbortController()
    if (timeoutSignal.aborted) controller.abort()
    if (clientSignal?.aborted) controller.abort()
    timeoutSignal.addEventListener('abort', () => controller.abort())
    clientSignal?.addEventListener('abort', () => controller.abort())
    return controller
  }

  private async ensureCooldown(): Promise<string | undefined> {
    const bucket = await hashNvidiaApiKey(this.apiKey)
    const limiter = this.rateLimiter?.getByName(bucket)
    if (!limiter) {
      logger.warn(`NVIDIA rate limiter not configured, proceeding without cooldown slot`)
      return undefined
    }
    const response = await limiter.fetch(`https://internal/reserve?provider=${this.name}`, { method: 'POST' })
    const lock = (await response.json().catch(() => ({}))) as ReservationResponse

    if (!response.ok || lock.allowed === false) {
      throwRateLimited(lock, response.headers)
    }
    return lock.token
  }

  private async releaseCooldown(token?: string): Promise<void> {
    const bucket = await hashNvidiaApiKey(this.apiKey)
    const limiter = this.rateLimiter?.getByName(bucket)
    if (!limiter) return

    try {
      const url = token
        ? `https://internal/inflight-done?provider=${this.name}&token=${encodeURIComponent(token)}`
        : `https://internal/inflight-done?provider=${this.name}`
      const response = await limiter.fetch(url, { method: 'POST' })
      if (!response.ok) {
        logger.warn(`[NVIDIA] Failed to release rate limiter slot: ${response.status}`)
      }
    } catch (err) {
      logger.warn(`[NVIDIA] Rate limiter release call threw: ${err instanceof Error ? err.message : err}`)
    }
  }

  /** Reactively opens the circuit breaker on a real NIM 429 so the gate stops
   *  probing NVIDIA during the compounding ~30-min cooldown (Case A). */
  private async openCircuit(): Promise<void> {
    const bucket = await hashNvidiaApiKey(this.apiKey)
    const limiter = this.rateLimiter?.getByName(bucket)
    if (!limiter) return

    const ttlMs = ProviderConfigs[this.name]?.rateLimit?.circuitBreakerTtlMs ?? 30 * 60_000
    try {
      const response = await limiter.fetch(
        `https://internal/circuit-open?provider=${this.name}&ttl=${ttlMs}`,
        { method: 'POST' },
      )
      if (!response.ok) {
        logger.warn(`[NVIDIA] Failed to open circuit breaker: ${response.status}`)
      }
    } catch (err) {
      logger.warn(`[NVIDIA] Circuit open call threw: ${err instanceof Error ? err.message : err}`)
    }
  }
}
