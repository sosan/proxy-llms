import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocks must be defined before imports because vi.mock is hoisted
vi.mock('../../providers/provider-factory', () => ({
  getProviderByName: vi.fn().mockReturnValue({
    transformRequest: vi.fn().mockReturnValue({ model: 'test', stream: true }),
    makeRequest: vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'test' } }],
    }),
    makeStreamRequest: vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers(),
      body: new ReadableStream(),
    }),
  }),
}))

vi.mock('../../metrics/metrics-collector', () => ({
  MetricsCollector: class MockMetricsCollector {
    setUpstreamStatus = vi.fn()
    createStreamingTransformStream = vi.fn().mockReturnValue(new TransformStream())
    recordNonStreamingMetrics = vi.fn()
  },
}))

vi.mock('../../utils/logger', () => ({
  logger: {
    withEnv: vi.fn().mockReturnValue({
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
    }),
  },
}))

vi.mock('../../transformers/claude-to-openai', () => ({
  transformClaudeToOpenAI: vi.fn((payload) => ({ ...payload, _transformed: true })),
}))

vi.mock('../../transformers/openai-to-claude', () => ({
  transformOpenAIToClaude: vi.fn((response) => ({ ...response, _claude: true })),
}))

// Mock ProviderConfigs to remove alterEndpoint for these tests (force standard path)
vi.mock('../../config/providers', async () => {
  const actual = await vi.importActual('../../config/providers')
  return {
    ...actual,
    ProviderConfigs: {
      nvidia: {
        endpoint: '/chat/completions',
        models: {},
        format: 'openai',
      },
      openrouter: {
        endpoint: '/chat/completions',
        models: {},
        format: 'openai',
      },
      claude: {
        endpoint: '/messages',
        models: {},
        format: 'anthropic',
      },
    },
  }
})

import { handleClaudeMessages } from '../../controllers/claude-messages'
import { getProviderByName } from '../../providers/provider-factory'

describe('handleClaudeMessages - streaming', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createMockContext = (overrides: any = {}) => ({
    req: {
      json: vi.fn().mockResolvedValue(overrides.body ?? { model: 'nvidia/glm5.1', messages: [] }),
      ...overrides.req,
    },
    env: {
      ANTHROPIC_OPUS_MODEL: 'nvidia/opus',
      ANTHROPIC_SONNET_MODEL: 'nvidia/sonnet',
      ANTHROPIC_HAIKU_MODEL: 'nvidia/haiku',
      ANTHROPIC_DEFAULT_MODEL: 'nvidia/default',
      ...overrides.env,
    },
    json: vi.fn().mockReturnValue('mocked-response'),
    ...overrides,
  })

  describe('streaming response', () => {
    it('should return a Response with SSE headers for streaming requests', async () => {
      const encoder = new TextEncoder()
      const chunks = [
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","model":"gpt-4","choices":[{"delta":{"content":"Hello"},"index":0,"finish_reason":null}]\n\n',
        'data: [DONE]\n\n',
      ]

      const readable = new ReadableStream({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(encoder.encode(chunk))
          }
          controller.close()
        },
      })

      const mockProvider = {
        transformRequest: vi.fn().mockReturnValue({ model: 'test', stream: true }),
        makeRequest: vi.fn(),
        makeStreamRequest: vi.fn().mockResolvedValue({
          status: 200,
          headers: new Headers({ 'content-type': 'text/event-stream' }),
          body: readable,
        }),
      }

        ; (getProviderByName as any).mockReturnValue(mockProvider)

      const c = createMockContext({
        body: { model: 'nvidia/glm5.1', messages: [{ role: 'user', content: 'hello' }] },
      })

      const response = await handleClaudeMessages(c as any)

      expect(response).toBeInstanceOf(Response)
      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('text/event-stream')
      expect(response.headers.get('Cache-Control')).toBe('no-cache')
      expect(response.headers.get('Connection')).toBe('keep-alive')
    })

    it('should throw ProviderError when upstream returns empty stream body', async () => {
      const mockProvider = {
        transformRequest: vi.fn().mockReturnValue({ model: 'test', stream: true }),
        makeRequest: vi.fn(),
        makeStreamRequest: vi.fn().mockResolvedValue({
          status: 200,
          headers: new Headers(),
          body: null,
        }),
      }

        ; (getProviderByName as any).mockReturnValue(mockProvider)

      const c = createMockContext({
        body: { model: 'nvidia/glm5.1', messages: [{ role: 'user', content: 'hello' }] },
      })

      await expect(handleClaudeMessages(c as any)).rejects.toThrow('Provider returned a streaming response without a body')
    })
  })
})
