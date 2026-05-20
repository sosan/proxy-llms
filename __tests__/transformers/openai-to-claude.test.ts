import { describe, it, expect } from 'vitest'
import { transformOpenAIToClaude, transformOpenAIStreamChunkToClaude } from '../../transformers/openai-to-claude'

interface ClaudeContentBlock {
  type: 'text' | 'tool_use'
  text?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
}

interface ClaudeResponse {
  id: string
  type: 'message'
  role: 'assistant'
  model: string
  content: ClaudeContentBlock[]
  stop_reason: string
  usage: Record<string, unknown>
  created_at?: string
}

describe('transformOpenAIToClaude', () => {
  it('should transform a basic OpenAI response', () => {
    const openaiResponse = {
      id: 'chatcmpl-123',
      model: 'nvidia/glm5.1',
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'Hello, how can I help you?',
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
    }

    const result = transformOpenAIToClaude(openaiResponse)

    expect(result.id).toBe('chatcmpl-123')
    expect(result.type).toBe('message')
    expect(result.role).toBe('assistant')
    expect(result.model).toBe('nvidia/glm5.1')
    expect(result.stop_reason).toBe('end_turn')
    expect(result.content).toEqual([{ type: 'text', text: 'Hello, how can I help you?' }])
    expect(result.usage).toEqual({
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
    })
  })

  it('should transform tool_calls to tool_use blocks', () => {
    const openaiResponse = {
      id: 'chatcmpl-456',
      model: 'nvidia/glm5.1',
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'I will check the weather.',
            tool_calls: [
              {
                id: 'call_123',
                function: {
                  name: 'get_weather',
                  arguments: JSON.stringify({ location: 'Madrid' }),
                },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    }

    const result = transformOpenAIToClaude(openaiResponse) as unknown as ClaudeResponse

    expect(result.stop_reason).toBe('tool_use')
    expect(result.content).toHaveLength(2)
    expect(result.content[0]).toEqual({ type: 'text', text: 'I will check the weather.' })
    expect(result.content[1]).toEqual({
      type: 'tool_use',
      id: 'call_123',
      name: 'get_weather',
      input: { location: 'Madrid' },
    })
  })

  it('should handle max_tokens finish reason', () => {
    const openaiResponse = {
      id: 'chatcmpl-789',
      model: 'nvidia/glm5.1',
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'Partial response...',
          },
          finish_reason: 'length',
        },
      ],
    }

    const result = transformOpenAIToClaude(openaiResponse)

    expect(result.stop_reason).toBe('max_tokens')
  })

  it('should handle empty choices', () => {
    const openaiResponse = {
      id: 'chatcmpl-empty',
      model: 'nvidia/glm5.1',
      choices: [],
      usage: {},
    }

    const result = transformOpenAIToClaude(openaiResponse)

    expect(result.type).toBe('message')
    expect(result.role).toBe('assistant')
    expect(result.content).toEqual([])
    expect(result.stop_reason).toBe('end_turn')
  })

  it('should include created_at when created is present', () => {
    const openaiResponse = {
      id: 'chatcmpl-time',
      model: 'nvidia/glm5.1',
      created: 1678900000,
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'Hello',
          },
          finish_reason: 'stop',
        },
      ],
    }

    const result = transformOpenAIToClaude(openaiResponse)

    expect(result.created_at).toBeDefined()
    expect(typeof result.created_at).toBe('string')
  })
})

describe('transformOpenAIStreamChunkToClaude', () => {
  it('should transform a streaming chunk', () => {
    const chunk = {
      id: 'chatcmpl-stream',
      model: 'nvidia/glm5.1',
      delta: {
        content: 'Hello',
      },
    }

    const result = transformOpenAIStreamChunkToClaude(chunk)

    expect(result.type).toBe('message')
    expect(result.role).toBe('assistant')
    expect(result.model).toBe('nvidia/glm5.1')
    expect(result.content).toEqual([{ type: 'text', text: 'Hello' }])
  })

  it('should handle tool call deltas in stream', () => {
    const chunk = {
      id: 'chatcmpl-tool',
      model: 'nvidia/glm5.1',
      delta: {
        tool_calls: [
          {
            id: 'call_456',
            function: {
              name: 'get_weather',
            },
          },
        ],
      },
    }

    const result = transformOpenAIStreamChunkToClaude(chunk) as unknown as ClaudeResponse

    expect(result.content).toHaveLength(1)
    expect(result.content[0]).toEqual({
      type: 'tool_use',
      id: 'call_456',
      name: 'get_weather',
      input: {},
    })
  })

  it('should handle empty delta', () => {
    const chunk = {
      id: 'chatcmpl-empty',
      model: 'nvidia/glm5.1',
      delta: {},
    }

    const result = transformOpenAIStreamChunkToClaude(chunk)

    expect(result.content).toEqual([])
  })
})
