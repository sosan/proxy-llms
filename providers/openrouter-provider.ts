import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { BaseProvider } from './base-provider'
import { ProviderError } from '../errors/provider-error'

/**
 * OpenRouter Provider
 * Forwards requests to OpenRouter API (openrouter.ai)
 * OpenRouter uses an OpenAI-compatible API
 */
export class OpenRouterProvider extends BaseProvider {
  readonly name = 'openrouter'

  async makeStreamRequest(endpoint: string, payload: unknown): Promise<Response> {
    const requestId = crypto.randomUUID().slice(0, 8)
    const uri = `${this.baseUrl}${endpoint}`
    const timeout = this.createAbortTimeout(requestId)

    console.log(`[${requestId}] → OpenRouter stream request`, { uri })
    this.logUpstreamConfig(requestId, payload)

    let response: Response
    try {
      response = await fetch(uri, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://proxy-llms.local',
          'X-Title': 'Proxy LLMs',
        },
        body: JSON.stringify(payload),
        signal: timeout.signal,
      })
    } catch (err) {
      timeout.clear()
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ProviderError(
          'OpenRouter did not send a response before the proxy timeout',
          504 as ContentfulStatusCode,
          'upstream_timeout',
          'OpenRouter took too long to respond. Retry the request or try a faster model.'
        )
      }
      throw new ProviderError(
        `Network error while contacting OpenRouter: ${err instanceof Error ? err.message : 'unknown'}`,
        502 as ContentfulStatusCode,
        'upstream_network_error',
        'Could not connect to OpenRouter. Retry the request in a few seconds.'
      )
    }

    timeout.clear()

    if (!response.ok) {
      const errorBody = await this.readErrorBody(response)
      throw this.createUpstreamError(response, errorBody, 'OpenRouter')
    }

    return response
  }

  async makeRequest(endpoint: string, payload: unknown, _configFormat: string): Promise<unknown> {
    const requestId = crypto.randomUUID().slice(0, 8)
    const uri = `${this.baseUrl}${endpoint}`
    const timeout = this.createAbortTimeout(requestId)

    console.log(`[${requestId}] → OpenRouter request`, { uri })
    this.logUpstreamConfig(requestId, payload)

    let response: Response
    try {
      response = await fetch(uri, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://proxy-llms.local',
          'X-Title': 'Proxy LLMs',
        },
        body: JSON.stringify(payload),
        signal: timeout.signal,
      })
    } catch (err) {
      timeout.clear()
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ProviderError(
          'OpenRouter did not send a response before the proxy timeout',
          504 as ContentfulStatusCode,
          'upstream_timeout',
          'OpenRouter took too long to respond. Retry the request or try a faster model.'
        )
      }
      throw new ProviderError(
        `Network error while contacting OpenRouter: ${err instanceof Error ? err.message : 'unknown'}`,
        502 as ContentfulStatusCode,
        'upstream_network_error',
        'Could not connect to OpenRouter. Retry the request in a few seconds.'
      )
    }

    timeout.clear()

    if (!response.ok) {
      const errorBody = await this.readErrorBody(response)
      throw this.createUpstreamError(response, errorBody, 'OpenRouter')
    }

    return response.json()
  }
}
