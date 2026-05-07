import type { ProviderConfig } from '../interfaces/general'

export type ModelDefaults = {
  temperature?: number
  top_p?: number
  max_tokens?: number
  stream?: boolean
}

export const ProviderConfigs: Record<string, ProviderConfig> = {
  claude: {
    endpoint: '/messages',
    models: {
      'claude-3.5-sonnet': 'anthropic/claude-3.5-sonnet-20240620',
      'claude-3-opus': 'anthropic/claude-3-opus-20240229',
      'claude-3-haiku': 'anthropic/claude-3-haiku-20240307',
      'anthropic/claude-3.5-sonnet': 'anthropic/claude-3.5-sonnet-20240620',
      'anthropic/claude-3-opus': 'anthropic/claude-3-opus-20240229',
      'anthropic/claude-3-haiku': 'anthropic/claude-3-haiku-20240307',
    },
    format: 'anthropic',
  },
  openai: {
    endpoint: '/chat/completions',
    models: {
      'gpt-oss-120b': 'openai/gpt-oss-120b',
      'gpt-4o': 'openai/gpt-4o',
      'gpt-4o-mini': 'openai/gpt-4o-mini',
      'glm4.7': 'z-ai/glm4.7',
      'deepseek-v4-pro': 'deepseek-ai/deepseek-v4-pro',
      'deepseek-r1': 'deepseek-ai/deepseek-r1',
      'deepseek-v3': 'deepseek-ai/deepseek-v3',
      'minimax-m2.7': 'minimaxai/minimax-m2.7',
      'kimi-k2-thinking': 'moonshotai/kimi-k2-thinking',
      'qwen3-coder-480b-a35b-instruct': 'qwen/qwen3-coder-480b-a35b-instruct',
      'openai/gpt-oss-120b': 'openai/gpt-oss-120b',
      'openai/gpt-4o': 'openai/gpt-4o',
      'openai/gpt-4o-mini': 'openai/gpt-4o-mini',
      'z-ai/glm4.7': 'z-ai/glm4.7',
      'deepseek/deepseek-v4-pro': 'deepseek/deepseek-v4-pro',
      'deepseek/deepseek-r1': 'deepseek/deepseek-r1',
      'deepseek/deepseek-v3': 'deepseek/deepseek-v3',
      'minimaxai/minimax-m2.7': 'minimaxai/minimax-m2.7',
      'moonshotai/kimi-k2-thinking': 'moonshotai/kimi-k2-thinking',
      'qwen/qwen3-coder-480b-a35b-instruct': 'qwen/qwen3-coder-480b-a35b-instruct',
    },
    format: 'openai',
  },
}

export const ModelDefaultsById: Record<string, ModelDefaults> = {
  'openai/gpt-oss-120b': {
    temperature: 0.2,
    top_p: 1,
    max_tokens: 32768,
    stream: true,
  },
  'z-ai/glm4.7': {
    temperature: 0.3,
    top_p: 0.95,
    max_tokens: 32768,
    stream: true,
  },
  'deepseek-ai/deepseek-v4-pro': {
    temperature: 0.2,
    top_p: 0.95,
    max_tokens: 32768,
    stream: true,
  },
  'deepseek-ai/deepseek-r1': {
    temperature: 0.6,
    top_p: 0.95,
    max_tokens: 32768,
    stream: true,
  },
  'deepseek-ai/deepseek-v3': {
    temperature: 0.2,
    top_p: 0.95,
    max_tokens: 32768,
    stream: true,
  },
  'minimaxai/minimax-m2.7': {
    temperature: 0.2,
    top_p: 0.9,
    max_tokens: 32768,
    stream: true,
  },
  'moonshotai/kimi-k2-thinking': {
    temperature: 0.6,
    top_p: 0.95,
    max_tokens: 32768,
    stream: true,
  },
  'qwen/qwen3-coder-480b-a35b-instruct': {
    temperature: 0.2,
    top_p: 0.8,
    max_tokens: 32768,
    stream: true,
  },
}

export const resolveModel = (config: ProviderConfig, payloadModel: string | null | undefined): string => {
  const aliases = config.models
  const fullIds = Object.values(aliases)

  if (payloadModel) {
    console.log(`Resolving model for payload model: "${payloadModel}" with config format: "${config.format}"`)
    if (aliases[payloadModel]) {
      return aliases[payloadModel]
    }
    if (fullIds.includes(payloadModel)) {
      return payloadModel
    }
    throw new Error(
      `Model alias "${payloadModel}" is not supported by this provider config. Supported aliases: ${Object.keys(aliases).join(', ')}`
    )
  }

  const defaultAlias = Object.keys(aliases)[0]
  return aliases[defaultAlias]
}

export const createModelsList = (providerName: string) => {
  const config = ProviderConfigs[providerName]
  const created = 0

  return {
    object: 'list',
    data: Object.keys(config.models).map((id) => ({
      id,
      object: 'model',
      created,
      owned_by: config.models[id].split('/')[0] || providerName,
    })),
  }
}
