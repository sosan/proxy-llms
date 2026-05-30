import type { ProviderConfig } from '../interfaces/general'
import { logger } from '../utils/logger'

export type ModelDefaults = {
  temperature?: number
  top_p?: number
  max_tokens?: number
  maxTokensCap?: number
  stream?: boolean
  extra?: Record<string, unknown>
  supportsToolCalling?: boolean
}

const _ProviderConfigs = {
  claude: {
    endpoint: '/messages',
    models: {
      'claude-opus-4-7': 'claude-opus-4-7',
      'claude-sonnet-4-6': 'claude-sonnet-4-6',
      'claude-haiku-4-6': 'claude-haiku-4-6',
    },
    format: 'anthropic',
    supportsToolCalling: true,
  },
  nvidia: {
    endpoint: '/chat/completions',
    alterEndpoint: '/messages',
    models: {
      'z-ai/glm-5.1': 'z-ai/glm-5.1', // 5 ranking GB200x4
      'z-ai/glm5.1': 'z-ai/glm-5.1',
      'zai/glm-5.1': 'z-ai/glm-5.1',
      'zai/glm5.1': 'z-ai/glm-5.1',
      'moonshotai/kimi-k2.6': 'moonshotai/kimi-k2.6', // 7 ranking GB200x4
      'z-ai/glm4.7': 'z-ai/glm4.7', // 20 ranking H100x8
      'deepseek/deepseek-v4-pro': 'deepseek/deepseek-v4-pro', // 16 ranking
      'minimaxai/minimax-m2.7': 'minimaxai/minimax-m2.7', // 28 ranking
      'moonshotai/kimi-k2-thinking': 'moonshotai/kimi-k2-thinking', // 56 ranking
      'qwen/qwen3-coder-480b-a35b-instruct': 'qwen/qwen3-coder-480b-a35b-instruct', // 62 arena ranking
      'openai/gpt-oss-120b': 'openai/gpt-oss-120b', // no ranking
      'stepfun-ai/step-3.5-flash': 'stepfun-ai/step-3.5-flash', // no ranking
      'google/gemma-4-31b-it': 'google/gemma-4-31b-it', // 43 ranking
    },
    format: 'openai',
    supportsToolCalling: true, // Some models support tool calling, some don't; checked per-model via ModelDefaultsById
  },
  google: {
    endpoint: '/chat/completions',
    models: {
    },
    format: 'google',
  },
  openrouter: {
    endpoint: '/chat/completions',
    models: {},
    format: 'openai',
    supportsToolCalling: true,
  },
  lmstudio: {
    endpoint: '/chat/completions',
    models: {},
    format: 'openai',
  },
  llamacpp: {
    endpoint: '/chat/completions',
    models: {},
    format: 'openai',
  },
  ollama: {
    endpoint: '/chat/completions',
    models: {},
    format: 'openai',
  },
} as const

export const ProviderConfigs: Record<string, ProviderConfig> = _ProviderConfigs

export type ProviderType = keyof typeof _ProviderConfigs


export const ModelDefaultsById: Record<string, ModelDefaults> = {
  'openai/gpt-oss-120b': {
    temperature: 0.2,
    top_p: 1,
    max_tokens: 32768,
    stream: true,
  },
  'z-ai/glm4.7': {
    temperature: 0.9,
    top_p: 0.95,
    max_tokens: 32768,
    stream: true,
    extra: {
      chat_template_kwargs: {
        enable_thinking: true,
        clear_thinking: false,
      },
    },
  },
  'z-ai/glm5.1': {
    temperature: 0.9,
    top_p: 0.95,
    max_tokens: 32768,
    stream: true,
    supportsToolCalling: false,
    extra: {
      chat_template_kwargs: {
        enable_thinking: true,
        clear_thinking: false,
      },
    },
  },
  'z-ai/glm-5.1': {
    temperature: 0.9,
    top_p: 0.95,
    max_tokens: 8192,
    maxTokensCap: 8192,
    stream: true,
    supportsToolCalling: false,
    extra: {
      chat_template_kwargs: {
        enable_thinking: true,
        clear_thinking: false,
      },
    },
  },
  'deepseek/deepseek-v4-pro': {
    temperature: 1,
    top_p: 0.95,
    max_tokens: 16384,
    stream: true,
    extra: {
      chat_template_kwargs: {
        thinking: false,
      },
    },
  },
  'minimaxai/minimax-m2.7': {
    temperature: 0.2,
    top_p: 0.9,
    max_tokens: 8192,
    maxTokensCap: 8192,
    stream: true,
  },
  'moonshotai/kimi-k2-thinking': {
    temperature: 0.6,
    top_p: 0.95,
    max_tokens: 32768,
    stream: true,
  },
  'moonshotai/kimi-k2.6': {
    temperature: 1,
    top_p: 0.95,
    max_tokens: 8192,
    maxTokensCap: 8192,
    stream: true,
    supportsToolCalling: false,
    extra: {
      "chat_template_kwargs": {
        thinking: true,
      },
    }
  },
  'stepfun-ai/step-3.5-flash': { // no ranking
    temperature: 1,
    top_p: 0.9,
    max_tokens: 26214,
    stream: true,
  },
  'qwen/qwen3-coder-480b-a35b-instruct': { // 62 arena ranking
    temperature: 0.7,
    top_p: 0.8,
    supportsToolCalling: false,
    max_tokens: 262144,
    stream: true,
  },
  'google/gemma-4-31b-it': {
    temperature: 1,
    top_p: 0.8,
    max_tokens: 32768,
    stream: true,
    supportsToolCalling: false,
    extra: {
      chat_template_kwargs: { enable_thinking: true },
    }
  }

}

export const resolveModel = (config: ProviderConfig, payloadModel: string | null | undefined): string => {
  const aliases = config.models
  const fullIds = Object.values(aliases)

  if (payloadModel) {
    logger.debug(`Resolving model for payload model: "${payloadModel}" with config format: "${config.format}"`)
    if (aliases[payloadModel]) {
      return aliases[payloadModel]
    }
    if (fullIds.includes(payloadModel)) {
      return payloadModel
    }
    // Fallback: allow partial match (e.g., "kimi-k2.6" matches "moonshotai/kimi-k2.6")
    const partialMatch = fullIds.find(id => id === payloadModel || id.endsWith(`/${payloadModel}`))
    if (partialMatch) {
      return partialMatch
    }
    throw new Error(
      `Model alias "${payloadModel}" is not supported by this provider config. Supported aliases: ${Object.keys(aliases).join(', ')}`
    )
  }

  const defaultAlias = Object.keys(aliases)[0]
  return aliases[defaultAlias]
}

export const resolveAnthropicModel = (env: Record<string, string | undefined>, modelInput: string): string => {
  const lowerModel = modelInput.toLowerCase()
  if (lowerModel.includes('opus')) {
    return env.ANTHROPIC_OPUS_MODEL || modelInput
  }
  if (lowerModel.includes('sonnet')) {
    return env.ANTHROPIC_SONNET_MODEL || modelInput
  }
  if (lowerModel.includes('haiku')) {
    return env.ANTHROPIC_HAIKU_MODEL || modelInput
  }
  return env.ANTHROPIC_DEFAULT_MODEL || modelInput
}

export const createModelsList = (providerName: string) => {
  const config = ProviderConfigs[providerName]
  const created = 0
  const models = Object.entries(config.models)

  return {
    object: 'list',
    data: models.map(([id, resolvedId]) => ({
      id,
      object: 'model',
      created,
      owned_by: resolvedId.split('/')[0] || providerName,
    })),
  }
}

export const createAllModelsList = () => {
  const created = 0
  const allModels: Array<{ id: string; object: string; created: number; owned_by: string }> = []

  for (const [providerName, config] of Object.entries(ProviderConfigs)) {
    const models = Object.entries(config.models)
    for (const [id, resolvedId] of models) {
      allModels.push({
        id,
        object: 'model',
        created,
        owned_by: resolvedId.split('/')[0] || providerName,
      })
    }
  }

  return {
    object: 'list',
    data: allModels,
  }
}
