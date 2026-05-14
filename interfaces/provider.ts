import type { ProviderConfig, GenericPayload } from '../interfaces/general'
import type { ProviderType } from '../config/providers'

/**
 * Unified interface for all AI providers (NVIDIA, OpenRouter, LMStudio, LlamaCPP, Ollama, etc.)
 */
export interface AIProvider {
  /** Provider name (e.g., 'nvidia', 'openrouter', 'lmstudio') */
  readonly name: string

  /** Make a non-streaming request */
  makeRequest(endpoint: string, payload: unknown, configFormat: string): Promise<unknown>

  /** Make a streaming request */
  makeStreamRequest(endpoint: string, payload: unknown): Promise<Response>

  /** Transform the generic payload into provider-specific format */
  transformRequest(payload: GenericPayload, config: ProviderConfig): unknown
}

// ProviderType is now derived from ProviderConfigs in config/providers.ts
export type { ProviderType }
