import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { BaseProvider, sleep, getRetryDelay, RETRY_MAX_ATTEMPTS } from './base-provider'
import { ProviderError } from '../errors/provider-error'
import { logger } from '../utils/logger'

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
        if (!lastError || !isRetryable(lastError)) {
          throw err
        }

        if (attempt === RETRY_MAX_ATTEMPTS) {
          logger.warn(`[${requestId}] Max retry attempts reached, propagating error`)
          throw err
        }

        const delay = getRetryDelay(attempt)
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
      (err) => err.status === 429
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
        },
        body: JSON.stringify(payload),
        signal: timeout.signal,
      })
    } catch (err) {
      timeout.clear()
      if (err instanceof Error && err.name === 'AbortError') {
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
      logger.error(`[${requestId}] ✘ Upstream error`, {
        status: response.status,
        retryAfter: response.headers.get('retry-after'),
        body: errorBody,
      })
      throw this.createUpstreamError(response, errorBody, 'NVIDIA')
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
      (err) => err.status === 429
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
        },
        body: JSON.stringify(payload),
        signal: timeout.signal,
      })
    } catch (err) {
      timeout.clear()
      if (err instanceof Error && err.name === 'AbortError') {
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
      throw this.createUpstreamError(response, errorBody, 'NVIDIA')
    }

    const json = await response.json()
    logger.info(`[${requestId}] ✔ Completed`, {
      finish_reason: ((json as Record<string, unknown>).choices as Array<{ finish_reason?: string }>)?.[0]?.finish_reason,
    })
    return json
  }
}
