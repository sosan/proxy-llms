import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { BaseProvider } from './base-provider'
import { ProviderError } from '../errors/provider-error'

/**
 * NVIDIA NIM Provider
 * Forwards requests to NVIDIA's API (api.nvidia.com)
 */
export class NvidiaProvider extends BaseProvider {
  readonly name = 'nvidia'

  async makeStreamRequest(endpoint: string, payload: unknown): Promise<Response> {
    const requestId = crypto.randomUUID().slice(0, 8)
    const uri = `${this.baseUrl}${endpoint}`
    const timeout = this.createAbortTimeout(requestId)

    console.log(`[${requestId}] → Stream request`, {
      uri,
      model: (payload as Record<string, unknown>).model,
    })
    this.logUpstreamConfig(requestId, payload)

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
        console.error(`[${requestId}] ✘ Timeout — NVIDIA did not respond in time`)
        throw new ProviderError(
          'NVIDIA did not send a response before the proxy timeout',
          504 as ContentfulStatusCode,
          'upstream_timeout',
          'NVIDIA took too long to respond. Retry the request or try a faster model.'
        )
      }
      console.error(`[${requestId}] ✘ Error de red`, { error: err instanceof Error ? err.message : err })
      throw new ProviderError(
        `Network error while contacting NVIDIA: ${err instanceof Error ? err.message : 'unknown'}`,
        502 as ContentfulStatusCode,
        'upstream_network_error',
        'Could not connect to NVIDIA. Retry the request in a few seconds.'
      )
    }

    timeout.clear()

    console.log(`[${requestId}] ← Respuesta upstream`, {
      status: response.status,
      contentType: response.headers.get('content-type'),
    })

    if (!response.ok) {
      const errorBody = await this.readErrorBody(response)
      console.error(`[${requestId}] ✘ Upstream error`, {
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
    const timeout = this.createAbortTimeout(requestId)

    console.log(`[${requestId}] → Request`, {
      uri,
      model: (payload as Record<string, unknown>).model,
      messages: ((payload as Record<string, unknown>).messages as unknown[])?.length ?? 0,
    })
    this.logUpstreamConfig(requestId, payload)

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
        console.error(`[${requestId}] ✘ Timeout — NVIDIA did not respond in time`)
        throw new ProviderError(
          'NVIDIA did not send a response before the proxy timeout',
          504 as ContentfulStatusCode,
          'upstream_timeout',
          'NVIDIA took too long to respond. Retry the request or try a faster model.'
        )
      }
      console.error(`[${requestId}] ✘ Error de red`, { error: err instanceof Error ? err.message : err })
      throw new ProviderError(
        `Network error while contacting NVIDIA: ${err instanceof Error ? err.message : 'unknown'}`,
        502 as ContentfulStatusCode,
        'upstream_network_error',
        'Could not connect to NVIDIA. Retry the request in a few seconds.'
      )
    }

    timeout.clear()

    console.log(`[${requestId}] ← Respuesta recibida`, {
      status: response.status,
      contentType: response.headers.get('content-type'),
    })

    if (!response.ok) {
      const errorBody = await this.readErrorBody(response)
      console.error(`[${requestId}] ✘ Error del servidor`, {
        status: response.status,
        retryAfter: response.headers.get('retry-after'),
        body: errorBody,
      })
      throw this.createUpstreamError(response, errorBody, 'NVIDIA')
    }

    const json = await response.json()
    console.log(`[${requestId}] ✔ Completada`, {
      finish_reason: ((json as Record<string, unknown>).choices as Array<{ finish_reason?: string }>)?.[0]?.finish_reason,
    })
    return json
  }
}
