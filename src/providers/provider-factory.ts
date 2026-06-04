import type { Env } from '../interfaces/general'
import type { AIProvider } from '../interfaces/provider'
import type { ProviderType } from '../config/providers'

import { NvidiaProvider } from './nvidia-provider'
import { OpenRouterProvider } from './openrouter-provider'
import { LMStudioProvider, LlamaCppProvider, OllamaProvider } from './local-provider'

// Provider singleton registry
const providerRegistry: Map<string, AIProvider> = new Map()

/**
 * Create a new provider instance based on the provider type.
 */
function createProvider(env: Env, type: ProviderType): AIProvider {
  switch (type) {
    case 'nvidia':
      return new NvidiaProvider(
        env.NVIDIA_API_KEY,
        env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1'
      )
    case 'openrouter':
      return new OpenRouterProvider(
        env.OPENROUTER_API_KEY || '',
        env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'
      )
    case 'lmstudio':
      return new LMStudioProvider('', env.LMSTUDIO_BASE_URL || 'http://localhost:1234/v1')
    case 'llamacpp':
      return new LlamaCppProvider('', env.LLAMACPP_BASE_URL || 'http://localhost:8080/v1')
    case 'ollama':
      return new OllamaProvider('', env.OLLAMA_BASE_URL || 'http://localhost:11434/v1')
    default:
      throw new Error(`Unknown provider type: ${type}`)
  }
}

/**
 * Get a specific provider by type. Creates it lazily.
 * All providers are available if their required credentials/env vars are present.
 */
export function getProvider(env: Env, type: ProviderType): AIProvider {
  if (!providerRegistry.has(type)) {
    providerRegistry.set(type, createProvider(env, type))
  }
  return providerRegistry.get(type)!
}

/**
 * Check if a string is a valid provider type.
 */
export function isValidProviderType(type: string): type is ProviderType {
  const validTypes: ProviderType[] = ['nvidia', 'openrouter', 'lmstudio', 'llamacpp', 'ollama']
  return validTypes.includes(type as ProviderType)
}

/**
 * Get a provider by its string name. Validates the name first.
 * Throws if the name is not a known provider type.
 */
export function getProviderByName(env: Env, name: string): AIProvider {
  if (!isValidProviderType(name)) {
    throw new Error(`Unknown provider type: ${name}`)
  }
  return getProvider(env, name)
}

/**
 * Reset the provider registry (useful for testing).
 */
export function resetProviderRegistry(): void {
  providerRegistry.clear()
}
