import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocks must be defined before imports because vi.mock is hoisted
vi.mock('../../providers/provider-factory', () => ({
  getProviderByName: vi.fn().mockReturnValue({
    transformRequest: vi.fn().mockReturnValue({ model: 'test', stream: false }),
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

import { handleClaudeMessages } from '../../controllers/claude-messages'
import { getProviderByName } from '../../providers/provider-factory'

describe('handleClaudeMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createMockContext = (overrides: any = {}) => ({
    req: {
      json: vi.fn().mockResolvedValue(overrides.body ?? { model: 'nvidia/z-ai/glm5.1', messages: [] }),
      ...overrides.req,
    },
    env: {
      ANTHROPIC_OPUS_MODEL: 'nvidia/moonshotai/kimi-k2.6',
      ANTHROPIC_SONNET_MODEL: 'nvidia/sonnet',
      ANTHROPIC_HAIKU_MODEL: 'nvidia/haiku',
      ANTHROPIC_DEFAULT_MODEL: 'nvidia/default',
      ...overrides.env,
    },
    json: vi.fn().mockReturnValue('mocked-response'),
    ...overrides,
  })

  describe('model mapping', () => {
    it('should strip provider prefix from model name for openai format', async () => {
      const c = createMockContext({
        body: { model: 'nvidia/glm5.1', messages: [{ role: 'user', content: 'hello' }] },
      })

      await handleClaudeMessages(c as any)

      expect(getProviderByName).toHaveBeenCalledWith(c.env, 'nvidia')
    })

    it('should use model name as-is when no provider prefix', async () => {
      const c = createMockContext({
        body: { model: 'nvidia/z-ai/glm5.1', messages: [] },
      })

      await handleClaudeMessages(c as any)

      // The provider should be resolved from the env-mapped model
      expect(getProviderByName).toHaveBeenCalledWith(expect.anything(), 'nvidia')
    })
  })

  describe('openai format provider', () => {
    it('should call getProviderByName with correct provider', async () => {
      const c = createMockContext({
        body: { model: 'nvidia/z-ai/glm5.1', messages: [{ role: 'user', content: 'hello' }] },
      })

      await handleClaudeMessages(c as any)

      expect(getProviderByName).toHaveBeenCalledWith(c.env, 'nvidia')
    })

    it('should return response for non-streaming', async () => {
      const c = createMockContext({
        body: { model: 'nvidia/glm5.1', messages: [{ role: 'user', content: 'hello' }] },
      })

      const result = await handleClaudeMessages(c as any)

      expect(result).toBe('mocked-response')
    })
  })

  describe('antrophic format provider', () => {
    it('should call getProviderByName with claude provider', async () => {
      const c = createMockContext({
        body: { model: 'antrophic/claude/claude-opus-4-7', messages: [{ role: 'user', content: 'hello' }] },
        env: {
          ANTHROPIC_OPUS_MODEL: 'antrophic/claude/claude-opus-4-7',
          ANTHROPIC_SONNET_MODEL: '',
          ANTHROPIC_HAIKU_MODEL: '',
          ANTHROPIC_DEFAULT_MODEL: '',
        },
      })

      await handleClaudeMessages(c as any)

      expect(getProviderByName).toHaveBeenCalledWith(c.env, 'antrophic')
    })
  })

  describe('error handling', () => {
    it('should return 400 when model is empty string', async () => {
      const c = createMockContext({
        body: { model: '', messages: [] },
      })
      await handleClaudeMessages(c as any)
      expect(c.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Model not specified in request body' }),
        { status: 400 }
      )
    })
  })
})
