import type { ProviderConfig } from '../interfaces/general'
import { logger } from '../utils/logger'

export type ModelDefaults = {
  endpoint?: string,
  temperature?: number
  top_p?: number
  max_tokens?: number
  maxTokensCap?: number
  stream?: boolean
  extra?: Record<string, unknown>
  supportsToolCalling?: boolean
  format?: 'anthropic' | 'openai' | 'google'
  frequency_penalty?: number
  logit_bias?: Record<string, number>
  presence_penalty?: number
  repetition_penalty?: number
  response_format?: Record<string, unknown>
  seed?: number
  stop?: string[]
  structured_outputs?: boolean
  tools?: unknown[]
  top_k?: number
}

const _ProviderConfigs = {
  claude: {
    endpoint: '/messages',
    models: {
      'claude-opus-4-7': 'claude-opus-4-7',
      'claude-sonnet-4-6': 'claude-sonnet-4-6',
      'claude-haiku-4-6': 'claude-haiku-4-6',
    },
    supportsToolCalling: true,
  },
  nvidia: {
    endpoint: '/chat/completions',
    alterEndpoint: '/messages',
    rateLimit: {
      requestsPerMinute: 25,
      minRetryDelayMs: 2500,
      maxQueueDelayMs: 30_000,
      jitterMs: 300,
      circuitBreakerTtlMs: 120_000,
      maxConcurrent: 3,
    },
    models: {
      'z-ai/glm-5.1': 'z-ai/glm-5.1', // 5 ranking GB200x4
      'z-ai/glm5.1': 'z-ai/glm-5.1',
      'zai/glm-5.1': 'z-ai/glm-5.1',
      'zai/glm5.1': 'z-ai/glm-5.1',
      'minimaxai/minimax-m3': 'minimaxai/minimax-m3',
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
    supportsToolCalling: true,
  },
  google: {
    endpoint: '/chat/completions',
    models: {
    },
  },
  openrouter: {
    endpoint: '/chat/completions',
    alterEndpoint: '/messages',
    models: {
      'nvidia/nemotron-3-ultra-550b-a55b:free': 'nvidia/nemotron-3-ultra-550b-a55b:free',
      'nvidia/nemotron-3-super-120b-a12b:free': 'nvidia/nemotron-3-super-120b-a12b:free',
      'openai/gpt-oss-120b:free': 'openai/gpt-oss-120b:free',
      'openai/gpt-oss-20b:free': 'openai/gpt-oss-20b:free',
      'google/gemma-4-31b-it:free': 'google/gemma-4-31b-it:free',
      'google/gemma-4-26b-a4b-it:free': 'google/gemma-4-26b-a4b-it:free',
      'nvidia/nemotron-3-nano-30b-a3b:free': 'nvidia/nemotron-3-nano-30b-a3b:free',
      'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free': 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
      'nvidia/nemotron-nano-9b-v2:free': 'nvidia/nemotron-nano-9b-v2:free',
      'nvidia/nemotron-nano-12b-v2-vl:free': 'nvidia/nemotron-nano-12b-v2-vl:free',
    },
    supportsToolCalling: true,
  },
  lmstudio: {
    endpoint: '/chat/completions',
    models: {},
  },
  llamacpp: {
    endpoint: '/chat/completions',
    models: {},
  },
  ollama: {
    endpoint: '/chat/completions',
    models: {},
  },
} as const

export const ProviderConfigs: Record<string, ProviderConfig> = _ProviderConfigs

export type ProviderType = keyof typeof _ProviderConfigs


export const ModelDefaultsById: Record<string, ModelDefaults> = {
  'nvidia/openai/gpt-oss-120b': {
    endpoint: '/chat/completions',
    format: 'openai',
    temperature: 0.2,
    top_p: 1,
    max_tokens: 32768,
    stream: true,
  },
  'nvidia/z-ai/glm4.7': {
    endpoint: '/chat/completions',
    format: 'openai',
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
  'nvidia/z-ai/glm5.1': {
    endpoint: '/chat/completions',
    format: 'openai',
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
  'nvidia/z-ai/glm-5.1': {
    endpoint: '/chat/completions',
    format: 'openai',
    temperature: 0.9,
    top_p: 0.95,
    max_tokens: 32768,
    maxTokensCap: 32768,
    stream: true,
    supportsToolCalling: true,
    extra: {
      chat_template_kwargs: {
        enable_thinking: true,
        clear_thinking: false,
      },
    },
  },
  'nvidia/deepseek/deepseek-v4-pro': {
    endpoint: '/chat/completions',
    format: 'openai',
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
  'nvidia/minimaxai/minimax-m2.7': {
    endpoint: '/chat/completions',
    format: 'openai',
    temperature: 0.2,
    top_p: 0.9,
    max_tokens: 8192,
    maxTokensCap: 8192,
    stream: true,
  },
  'nvidia/moonshotai/kimi-k2-thinking': {
    endpoint: '/chat/completions',
    format: 'openai',
    temperature: 0.6,
    top_p: 0.95,
    max_tokens: 32768,
    stream: true,
  },
  'anthropic/claude/claude-opus-4-7': {
    endpoint: '/messages',
    format: 'anthropic',
  },
  'nvidia/moonshotai/kimi-k2.6': {
    endpoint: '/chat/completions',
    format: 'openai',
    temperature: 1,
    top_p: 0.95,
    max_tokens: 32768,
    maxTokensCap: 32768,
    stream: true,
    supportsToolCalling: true,
    extra: {
      "chat_template_kwargs": {
        thinking: true,
      },
    }
  },
  'nvidia/minimaxai/minimax-m3': {
    endpoint: '/chat/completions',
    format: 'openai',
    temperature: 1,
    top_p: 0.95,
    max_tokens: 32768,
    maxTokensCap: 32768,
    stream: true,
    supportsToolCalling: true,
    extra: {
      "chat_template_kwargs": {
        thinking: true,
      },
    }
  },
  'nvidia/stepfun-ai/step-3.5-flash': { // no ranking
    endpoint: '/chat/completions',
    format: 'openai',
    temperature: 1,
    top_p: 0.9,
    max_tokens: 26214,
    stream: true,
  },
  'nvidia/qwen/qwen3-coder-480b-a35b-instruct': { // 62 arena ranking
    endpoint: '/chat/completions',
    format: 'openai',
    temperature: 0.7,
    top_p: 0.8,
    supportsToolCalling: false,
    max_tokens: 262144,
    stream: true,
  },
  'nvidia/google/gemma-4-31b-it': {
    endpoint: '/chat/completions',
    format: 'openai',
    temperature: 1,
    top_p: 0.8,
    max_tokens: 32768,
    stream: true,
    supportsToolCalling: false,
    extra: {
      chat_template_kwargs: { enable_thinking: true },
    }
  },
  'openrouter/nvidia/nemotron-3-ultra-550b-a55b:free': {
    endpoint: '/chat/completions',
    format: 'openai',
    temperature: 1,
    top_p: 0.95,
    max_tokens: 5834,
    maxTokensCap: 5834,
    stream: true,
    supportsToolCalling: true,
    extra: {
      "chat_template_kwargs": {
        thinking: true,
      },
    }
  },
  'openrouter/nvidia/nemotron-3-super-120b-a12b:free': {
    endpoint: '/chat/completions',
    format: 'openai',
    temperature: 1,
    top_p: 0.95,
    max_tokens: 5834,
    maxTokensCap: 5834,
    stream: true,
    supportsToolCalling: true,
    extra: {
      "chat_template_kwargs": {
        thinking: true,
      },
    }
  },

  'openrouter/openai/gpt-oss-120b:free': {
    endpoint: '/chat/completions',
    format: 'openai',
    temperature: 1,
    top_p: 0.95,
    max_tokens: 5834,
    maxTokensCap: 5834,
    stream: true,
    supportsToolCalling: true,
    extra: {
      "chat_template_kwargs": {
        thinking: true,
      },
    }
  },

  'openrouter/openai/gpt-oss-20b:free': {
    endpoint: '/chat/completions',
    format: 'openai',
    temperature: 1,
    top_p: 0.95,
    max_tokens: 5834,
    maxTokensCap: 5834,
    stream: true,
    supportsToolCalling: true,
    extra: {
      "chat_template_kwargs": {
        thinking: true,
      },
    }
  },

  'openrouter/google/gemma-4-31b-it:free': {
    endpoint: '/chat/completions',
    format: 'openai',
    temperature: 1,
    top_p: 0.95,
    max_tokens: 5834,
    maxTokensCap: 5834,
    stream: true,
    supportsToolCalling: true,
    extra: {
      "chat_template_kwargs": {
        thinking: true,
      },
    }
  },

  'openrouter/google/gemma-4-26b-a4b-it:free': {
    endpoint: '/chat/completions',
    format: 'openai',
    temperature: 1,
    top_p: 0.95,
    max_tokens: 5834,
    maxTokensCap: 5834,
    stream: true,
    supportsToolCalling: true,
    extra: {
      "chat_template_kwargs": {
        thinking: true,
      },
    }
  },
  'openrouter/nvidia/nemotron-3-nano-30b-a3b:free': {
    endpoint: '/chat/completions',
    format: 'openai',
    temperature: 1,
    top_p: 0.95,
    max_tokens: 5834,
    maxTokensCap: 5834,
    stream: true,
    supportsToolCalling: true,
    extra: {
      "chat_template_kwargs": {
        thinking: true,
      },
    }
  },
  'openrouter/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free': {
    endpoint: '/chat/completions',
    format: 'openai',
    temperature: 1,
    top_p: 0.95,
    max_tokens: 5834,
    maxTokensCap: 5834,
    stream: true,
    supportsToolCalling: true,
    extra: {
      "chat_template_kwargs": {
        thinking: true,
      },
    }
  },
  'openrouter/nvidia/nemotron-nano-9b-v2:free': {
    endpoint: '/chat/completions',
    format: 'openai',
    temperature: 1,
    top_p: 0.95,
    max_tokens: 5834,
    maxTokensCap: 5834,
    stream: true,
    supportsToolCalling: true,
    extra: {
      "chat_template_kwargs": {
        thinking: true,
      },
    }
  },
  'openrouter/nvidia/nemotron-nano-12b-v2-vl:free': {
    endpoint: '/chat/completions',
    format: 'openai',
    temperature: 1,
    top_p: 0.95,
    max_tokens: 5834,
    maxTokensCap: 5834,
    stream: true,
    supportsToolCalling: true,
    extra: {
      "chat_template_kwargs": {
        thinking: true,
      },
    }
  },
}

export const resolveModelFormat = (fullModelId: string): string => {
  const modelDefaults = ModelDefaultsById[fullModelId]
  if (modelDefaults?.format) {
    return modelDefaults.format
  }
  return 'openai'
}

export const resolveModelDefaults = (fullModelId: string): ModelDefaults | undefined => {
  return ModelDefaultsById[fullModelId] ?? undefined
}

export const resolveModel = (config: ProviderConfig, fullModelID: string | null | undefined): string => {
  const parts = fullModelID?.split('/')
  if (!parts || parts.length < 2) {
    logger.warn(`Model "${fullModelID}" does not contain a provider prefix. Attempting to resolve using full model ID or alias matching.`)
  }

  const model = parts?.slice(1).join('/')
  const aliases = config.models
  const fullIds = Object.values(aliases)

  if (model) {
    logger.debug(`Resolving model for payload model: "${fullModelID}"`)
    if (aliases[model]) {
      return aliases[model]
    }
    if (fullIds.includes(model)) {
      return model
    }
    // Fallback: allow partial match (e.g., "kimi-k2.6" matches "moonshotai/kimi-k2.6")
    const partialMatch = fullIds.find(id => id === fullModelID || id.endsWith(`/${fullModelID}`))
    if (partialMatch) {
      return partialMatch
    }
    throw new Error(
      `Model alias ${fullModelID} is not supported`
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
  const createdAt = new Date(0).toISOString()

  return {
    object: 'list',
    data: models.map(([id, resolvedId]) => ({
      id,
      object: 'model',
      created,
      created_at: createdAt,
      owned_by: resolvedId.split('/')[0] || providerName,
      display_name: resolvedId,
      type: 'model',
    })),
  }
}

export const createAllModelsList = () => {
  const created = 0
  const allModels: Array<{ id: string; object: string; created: number; created_at: string; owned_by: string; display_name: string; type: string }> = []
  const createdAt = new Date(0).toISOString()

  for (const [providerName, config] of Object.entries(ProviderConfigs)) {
    const models = Object.entries(config.models)
    for (const [id, resolvedId] of models) {
      allModels.push({
        id,
        object: 'model',
        created,
        created_at: createdAt,
        owned_by: resolvedId.split('/')[0] || providerName,
        display_name: resolvedId,
        type: 'model',
      })
    }
  }

  return {
    object: 'list',
    data: allModels,
  }
}
