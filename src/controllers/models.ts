import { Context } from 'hono'
import { ProviderConfigs, createModelsList, createAllModelsList } from '../config/providers'

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
