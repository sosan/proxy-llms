import { Context } from 'hono'
import { ProviderConfigs, createModelsList } from '../config/providers'
import { createResponse } from '../utils/response'

export const handleModels = async (c: Context) => {
  return c.json({"notcreated": "notcreated"})
}

export const handleProviderModels = async (c: Context) => {
  const urlProvider = c.req.param('provider')

  if (!urlProvider) {
    return c.json(createResponse(false, null, 'Provider not specified in URL'), { status: 400 })
  }

  const config = ProviderConfigs[urlProvider]
  if (!config) {
    const supportedProviders = Object.keys(ProviderConfigs).join(', ')
    return c.json(createResponse(false, null,
      `Unknown provider: "${urlProvider}". Supported: ${supportedProviders}`), { status: 400 })
  }

  return c.json(createModelsList(urlProvider))
}
