import type { ProviderConfig } from '../interfaces/general'
import { logger } from '../utils/logger'

export type ModelDefaults = {
  temperature?: number
  top_p?: number
  max_tokens?: number
  stream?: boolean
  extra?: Record<string, unknown>
}

const _ProviderConfigs = {
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
  nvidia: {
    endpoint: '/chat/completions',
    models: {
      'glm5.1': 'z-ai/glm-5.1',
      'glm-5.1': 'z-ai/glm-5.1',
      'kimi-k2.6': 'moonshotai/kimi-k2.6',
      'glm4.7': 'z-ai/glm4.7',
      'deepseek-v4-pro': 'deepseek-ai/deepseek-v4-pro',
      'minimax-m2.7': 'minimaxai/minimax-m2.7',
      'kimi-k2-thinking': 'moonshotai/kimi-k2-thinking',
      'qwen3-coder-480b-a35b-instruct': 'qwen/qwen3-coder-480b-a35b-instruct',
      'gpt-oss-120b': 'openai/gpt-oss-120b',
      'step-3.5-flash': 'stepfun-ai/step-3.5-flash',
      // Aliases for backward compatibility
      'z-ai/glm5.1': 'z-ai/glm-5.1', // 5 ranking GB200x4
      'z-ai/glm-5.1': 'z-ai/glm-5.1', // 5 ranking GB200x4
      'moonshotai/kimi-k2.6': 'moonshotai/kimi-k2.6', // 7 ranking GB200x4
      'z-ai/glm4.7': 'z-ai/glm4.7', // 20 ranking H100x8
      'deepseek/deepseek-v4-pro': 'deepseek/deepseek-v4-pro', // 16 ranking
      'minimaxai/minimax-m2.7': 'minimaxai/minimax-m2.7', // 28 ranking
      'moonshotai/kimi-k2-thinking': 'moonshotai/kimi-k2-thinking', // 56 ranking
      'qwen/qwen3-coder-480b-a35b-instruct': 'qwen/qwen3-coder-480b-a35b-instruct', // 62 arena ranking
      'openai/gpt-oss-120b': 'openai/gpt-oss-120b', // no ranking
      'stepfun-ai/step-3.5-flash': 'stepfun-ai/step-3.5-flash', // no ranking
      'google/gemma-4-31b-it': 'google/gemma-4-31b-it', // 43 ranking
      'gemma-4-31b-it': 'google/gemma-4-31b-it',
    },
    format: 'openai',
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
    max_tokens: 131072,
    stream: true,
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
    max_tokens: 131072,
    stream: true,
    extra: {
      chat_template_kwargs: {
        enable_thinking: true,
        clear_thinking: false,
      },
    },
  },
  'deepseek-ai/deepseek-v4-pro': {
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
    max_tokens: 32768,
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
    max_tokens: 65536,
    stream: true,
    extra: {
      "chat_template_kwargs": { "thinking": true },
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
    max_tokens: 262144,
    stream: true,
  },
  'google/gemma-4-31b-it': {
    temperature: 1,
    top_p: 0.8,
    max_tokens: 32768,
    stream: true,
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
  const aliases = Object.entries(config.models).filter(([id, resolvedId]) => id !== resolvedId)

  return {
    object: 'list',
    data: aliases.map(([id, resolvedId]) => ({
      id,
      object: 'model',
      created,
      owned_by: resolvedId.split('/')[0] || providerName,
    })),
  }
}



