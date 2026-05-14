import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { BaseProvider } from './base-provider'
import { ProviderError } from '../errors/provider-error'

/**
 * Base class for local AI providers (LMStudio, LlamaCPP, Ollama).
 * These providers run locally and typically don't need API keys.
 */
abstract class LocalProvider extends BaseProvider {
  async makeStreamRequest(endpoint: string, payload: unknown): Promise<Response> {
    const requestId = crypto.randomUUID().slice(0, 8)
    const uri = `${this.baseUrl}${endpoint}`
    const timeout = this.createAbortTimeout(requestId)

    console.log(`[${requestId}] → ${this.name} stream request`, { uri })
    this.logUpstreamConfig(requestId, payload)

    let response: Response
    try {
      response = await fetch(uri, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: timeout.signal,
      })
    } catch (err) {
      timeout.clear()
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ProviderError(
          `${this.name} did not respond before the proxy timeout`,
          504 as ContentfulStatusCode,
          'upstream_timeout',
          `${this.name} took too long to respond. Ensure the server is running.`
        )
      }
      throw new ProviderError(
        `Cannot connect to ${this.name}: ${err instanceof Error ? err.message : 'unknown'}`,
        502 as ContentfulStatusCode,
        'upstream_network_error',
        `Could not connect to ${this.name}. Ensure the server is running at ${this.baseUrl}.`
      )
    }

    timeout.clear()

    if (!response.ok) {
      const errorBody = await this.readErrorBody(response)
      throw this.createUpstreamError(response, errorBody, this.name)
    }

    return response
  }

  async makeRequest(endpoint: string, payload: unknown, _configFormat: string): Promise<unknown> {
    const requestId = crypto.randomUUID().slice(0, 8)
    const uri = `${this.baseUrl}${endpoint}`
    const timeout = this.createAbortTimeout(requestId)

    console.log(`[${requestId}] → ${this.name} request`, { uri })
    this.logUpstreamConfig(requestId, payload)

    let response: Response
    try {
      response = await fetch(uri, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: timeout.signal,
      })
    } catch (err) {
      timeout.clear()
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ProviderError(
          `${this.name} did not respond before the proxy timeout`,
          504 as ContentfulStatusCode,
          'upstream_timeout',
          `${this.name} took too long to respond. Ensure the server is running.`
        )
      }
      throw new ProviderError(
        `Cannot connect to ${this.name}: ${err instanceof Error ? err.message : 'unknown'}`,
        502 as ContentfulStatusCode,
        'upstream_network_error',
        `Could not connect to ${this.name}. Ensure the server is running at ${this.baseUrl}.`
      )
    }

    timeout.clear()

    if (!response.ok) {
      const errorBody = await this.readErrorBody(response)
      throw this.createUpstreamError(response, errorBody, this.name)
    }

    return response.json()
  }
}

/**
 * LM Studio Provider
 * Connects to a local LM Studio server (default: http://localhost:1234)
 */
export class LMStudioProvider extends LocalProvider {
  readonly name = 'lmstudio'
}

/**
 * llama.cpp Provider
 * Connects to a local llama.cpp server (default: http://localhost:8080)
 */
export class LlamaCppProvider extends LocalProvider {
  readonly name = 'llamacpp'
}

/**
 * Ollama Provider
 * Connects to a local Ollama server (default: http://localhost:11434)
 */
export class OllamaProvider extends LocalProvider {
  readonly name = 'ollama'
}
