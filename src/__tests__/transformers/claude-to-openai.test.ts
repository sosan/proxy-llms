import { describe, it, expect } from 'vitest'
import { transformClaudeToOpenAI } from '../../transformers/claude-to-openai'

describe('transformClaudeToOpenAI', () => {
  it('should transform a basic Claude request', () => {
    const claudeBody = {
      model: 'nvidia/glm5.1',
      messages: [
        { role: 'user', content: 'Hello, world!' },
      ],
      max_tokens: 4096,
      temperature: 0.7,
    }

    const result = transformClaudeToOpenAI(claudeBody)

    expect(result.model).toBe('nvidia/glm5.1')
    expect(result.messages).toHaveLength(1)
    expect(result.messages![0].role).toBe('user')
    expect(result.messages![0].content).toBe('Hello, world!')
    expect(result.max_tokens).toBe(4096)
    expect(result.temperature).toBe(0.7)
  })

  it('should transform Claude system field to system message', () => {
    const claudeBody = {
      model: 'nvidia/glm5.1',
      system: 'You are a helpful assistant.',
      messages: [
        { role: 'user', content: 'Hello' },
      ],
    }

    const result = transformClaudeToOpenAI(claudeBody)

    expect(result.messages).toHaveLength(2)
    expect(result.messages![0].role).toBe('system')
    expect(result.messages![0].content).toBe('You are a helpful assistant.')
    expect(result.messages![1].role).toBe('user')
    expect(result.messages![1].content).toBe('Hello')
  })

  it('should transform Claude tools to OpenAI tools format', () => {
    const claudeBody = {
      model: 'nvidia/glm5.1',
      messages: [{ role: 'user', content: 'What is the weather?' }],
      tools: [
        {
          name: 'get_weather',
          description: 'Get weather for a location',
          input_schema: {
            type: 'object',
            properties: {
              location: { type: 'string' },
            },
          },
        },
      ],
    }

    const result = transformClaudeToOpenAI(claudeBody)

    expect(result.tools).toHaveLength(1)
    expect((result.tools as Array<Record<string, unknown>>)[0]).toEqual({
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Get weather for a location',
        parameters: {
          type: 'object',
          properties: {
            location: { type: 'string' },
          },
        },
      },
    })
  })

  it('should transform Claude tool_choice to OpenAI tool_choice', () => {
    const claudeBody = {
      model: 'nvidia/glm5.1',
      messages: [{ role: 'user', content: 'Hello' }],
      tool_choice: { type: 'auto' },
    }

    const result = transformClaudeToOpenAI(claudeBody)

    expect(result.tool_choice).toBe('auto')
  })

  it('should handle array system content', () => {
    const claudeBody = {
      model: 'nvidia/glm5.1',
      system: [
        { text: 'First instruction.' },
        { text: 'Second instruction.' },
      ],
      messages: [{ role: 'user', content: 'Hello' }],
    }

    const result = transformClaudeToOpenAI(claudeBody)

    expect(result.messages![0].role).toBe('system')
    expect(result.messages![0].content).toBe('First instruction.\nSecond instruction.')
  })

  it('should pass through stream and top_p', () => {
    const claudeBody = {
      model: 'nvidia/glm5.1',
      messages: [{ role: 'user', content: 'Hello' }],
      stream: true,
      top_p: 0.9,
    }

    const result = transformClaudeToOpenAI(claudeBody)

    expect(result.stream).toBe(true)
    expect(result.top_p).toBe(0.9)
  })

  it('should handle messages with array content (blocks)', () => {
    const claudeBody = {
      model: 'nvidia/glm5.1',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is this?' },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: 'base64encodeddata',
              },
            },
          ],
        },
      ],
    }

    const result = transformClaudeToOpenAI(claudeBody)

    expect(result.messages).toHaveLength(1)
    const content = result.messages![0].content
    expect(Array.isArray(content)).toBe(true)
    expect((content as Array<{ type: string }>)[0].type).toBe('text')
    expect((content as Array<{ type: string }>)[1].type).toBe('image_url')
  })

  it('should handle tool_use blocks in messages', () => {
    const claudeBody = {
      model: 'nvidia/glm5.1',
      messages: [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'I will check the weather.' },
            {
              type: 'tool_use',
              id: 'tool_123',
              name: 'get_weather',
              input: { location: 'Madrid' },
            },
          ],
        },
      ],
    }

    const result = transformClaudeToOpenAI(claudeBody)

    expect(result.messages).toHaveLength(1)
    const msg = result.messages![0]
    expect(msg.role).toBe('assistant')
    expect(msg.content).toBe('I will check the weather.')
    expect(((msg as unknown) as Record<string, unknown>).tool_calls).toBeDefined()
  })

  it('should handle tool_result blocks in messages', () => {
    const claudeBody = {
      model: 'nvidia/glm5.1',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool_123',
              content: 'Sunny, 25°C',
            },
          ],
        },
      ],
    }

    const result = transformClaudeToOpenAI(claudeBody)

    expect(result.messages).toHaveLength(1)
    expect(result.messages![0].role).toBe('tool')
    expect(result.messages![0].content).toBe('Sunny, 25°C')
  })

  it('should pass through unknown fields', () => {
    const claudeBody = {
      model: 'nvidia/glm5.1',
      messages: [{ role: 'user', content: 'Hello' }],
      custom_field: 'custom_value',
      another_field: 42,
    }

    const result = transformClaudeToOpenAI(claudeBody)

    expect(result.custom_field).toBe('custom_value')
    expect(result.another_field).toBe(42)
  })

  it('should transform tool_choice any to required', () => {
    const claudeBody = {
      model: 'nvidia/glm5.1',
      messages: [{ role: 'user', content: 'Hello' }],
      tool_choice: { type: 'any' },
    }

    const result = transformClaudeToOpenAI(claudeBody)

    expect(result.tool_choice).toBe('required')
  })

  it('should transform tool_choice tool to function object', () => {
    const claudeBody = {
      model: 'nvidia/glm5.1',
      messages: [{ role: 'user', content: 'Hello' }],
      tool_choice: { type: 'tool', name: 'get_weather' },
    }

    const result = transformClaudeToOpenAI(claudeBody)

    expect(result.tool_choice).toEqual({ type: 'function', function: { name: 'get_weather' } })
  })

  it('should transform tool_choice auto string', () => {
    const claudeBody = {
      model: 'nvidia/glm5.1',
      messages: [{ role: 'user', content: 'Hello' }],
      tool_choice: 'auto',
    }

    const result = transformClaudeToOpenAI(claudeBody)

    expect(result.tool_choice).toBe('auto')
  })

  it('should handle empty message array', () => {
    const claudeBody = {
      model: 'nvidia/glm5.1',
      messages: [],
    }

    const result = transformClaudeToOpenAI(claudeBody)

    expect(result.messages).toEqual([])
  })
})
