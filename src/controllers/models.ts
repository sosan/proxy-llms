import { Context } from 'hono'
import { ProviderConfigs, createModelsList, createAllModelsList } from '../config/providers'
import { injectCaveman } from '../transformers/rtk/caveman'
import { compressMessages, formatRtkLog } from '../transformers/rtk'
import { ContentfulStatusCode } from 'hono/utils/http-status'
import { Env, TransformedPayload } from '../interfaces/general'
import { logger } from '../utils/logger'
import { CavemanLevel } from '../interfaces/rtk'

export const handleModels = async (c: Context) => {
  const modelsList = createAllModelsList()
  return c.json(modelsList)
}

export const handleProviderModels = async (c: Context) => {
  const urlProvider = c.req.param('provider')

  if (!urlProvider) {
    return c.json({ error: 'Provider not specified in URL' }, { status: 400 })
  }

  const config = ProviderConfigs[urlProvider]
  if (!config) {
    const supportedProviders = Object.keys(ProviderConfigs).join(', ')
    return c.json(
      { error: `Unknown provider: "${urlProvider}". Supported: ${supportedProviders}` },
      { status: 400 }
    )
  }

  return c.json(createModelsList(urlProvider))
}

/**
 * Extracts and validates the provider prefix from a model string (e.g., "nvidia/gpt-oss" → "nvidia").
 * Returns null if the model format is invalid.
 */
export function extractProviderFromModel(model: string): string | null {
  const parts = model.split('/')
  return parts.length >= 2 ? parts[0] : null
}

/**
 * Resolves the provider config or returns an error response.
 */
export function resolveProviderConfig(providerDC: string): { config: typeof ProviderConfigs[string] } | { error: string; status: ContentfulStatusCode } {
  const config = ProviderConfigs[providerDC]
  if (!config) {
    const supportedProviders = Object.keys(ProviderConfigs).join(', ')
    return {
      error: `Unknown provider: "${providerDC}". Supported: ${supportedProviders}`,
      status: 400 as ContentfulStatusCode,
    }
  }
  return { config }
}

/**
 * Applies RTK compression and Caveman middleware to the payload.
 * Returns a new payload (no mutation).
 */
export function applyPayloadMiddlewares(
  payload: TransformedPayload,
  env: Env,
  config: { format: 'anthropic' | 'openai' | 'google' }
): TransformedPayload {
  let result: TransformedPayload = { ...payload }

  // RTK: compress tool_result content before sending upstream
  if (env.RTK_ENABLED === 'true') {
    const rtkStats = compressMessages(result, true)
    const rtkLine = formatRtkLog(rtkStats)
    if (rtkLine) logger.debug(rtkLine)
  }

  // Caveman: inject terse-style system prompt before sending upstream
  if (env.CAVEMAN_ENABLED === 'true') {
    const cavemanLevel = (env.CAVEMAN_LEVEL || 'full') as CavemanLevel
    injectCaveman(result, config.format, cavemanLevel)
  }

  return result
}
