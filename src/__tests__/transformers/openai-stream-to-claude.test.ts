import { describe, it, expect, vi } from 'vitest'
import { createOpenAIStreamToClaudeTransformStream } from '../../transformers/openai-stream-to-claude'
import { logger } from '../../utils/logger'

vi.mock('../../utils/logger', () => ({
  logger: {
    withEnv: vi.fn().mockReturnValue({
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
    }),
  },
}))

describe('createOpenAIStreamToClaudeTransformStream', () => {
  it('transforms OpenAI SSE stream to Claude SSE format', async () => {
    const log = logger.withEnv({} as any)
    const transform = createOpenAIStreamToClaudeTransformStream(log)

    const openAIChunks = [
      'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","model":"gpt-4","choices":[{"delta":{"content":"Hello"},"index":0,"finish_reason":null}]}\n\n',
      'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","model":"gpt-4","choices":[{"delta":{"content":" world"},"index":0,"finish_reason":null}]}\n\n',
      'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","model":"gpt-4","choices":[{"delta":{},"index":0,"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ]

    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of openAIChunks) {
          controller.enqueue(new TextEncoder().encode(chunk))
        }
        controller.close()
      },
    })

    const outputStream = readable.pipeThrough(transform)
    const reader = outputStream.getReader()
    const decoder = new TextDecoder()
    let output = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        output += decoder.decode(value, { stream: true })
      }
    } finally {
      reader.releaseLock()
    }

    expect(output).toContain('event: message_start')
    expect(output).toContain('event: content_block_delta')
    expect(output).toContain('event: message_stop')
    expect(output).toContain('Hello')
    expect(output).toContain(' world')
  })

  it('handles empty or malformed chunks gracefully', async () => {
    const log = logger.withEnv({} as any)
    const transform = createOpenAIStreamToClaudeTransformStream(log)

    const chunks = [
      'data: [DONE]\n\n',
    ]

    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(new TextEncoder().encode(chunk))
        }
        controller.close()
      },
    })

    const outputStream = readable.pipeThrough(transform)
    const reader = outputStream.getReader()
    const decoder = new TextDecoder()
    let output = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        output += decoder.decode(value, { stream: true })
      }
    } finally {
      reader.releaseLock()
    }

    expect(output).toContain('event: message_stop')
  })

  it('handles tool_calls delta without content gracefully', async () => {
    const log = logger.withEnv({} as any)
    const transform = createOpenAIStreamToClaudeTransformStream(log)

    // Chunks with tool_calls but no content - stream should not break
    const openAIChunks = [
      'data: {"id":"chatcmpl-tool","object":"chat.completion.chunk","model":"gpt-4","choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_123","type":"function","function":{"name":"get_weather","arguments":""}}]},"index":0,"finish_reason":null}]}\n\n',
      'data: [DONE]\n\n',
    ]

    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of openAIChunks) {
          controller.enqueue(new TextEncoder().encode(chunk))
        }
        controller.close()
      },
    })

    const outputStream = readable.pipeThrough(transform)
    const reader = outputStream.getReader()
    const decoder = new TextDecoder()
    let output = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        output += decoder.decode(value, { stream: true })
      }
    } finally {
      reader.releaseLock()
    }

    // Stream should complete gracefully without breaking
    expect(output).toContain('message_stop')
  })

  it('handles partial chunks without newline in flush', async () => {
    const log = logger.withEnv({} as any)
    const transform = createOpenAIStreamToClaudeTransformStream(log)

    // Intentionally missing trailing newline to test flush
    const openAIChunks = [
      'data: {"id":"chatcmpl-123","choices":[{"delta":{"content":"Hello"}}]}',
    ]

    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of openAIChunks) {
          controller.enqueue(new TextEncoder().encode(chunk))
        }
        controller.close()
      },
    })

    const outputStream = readable.pipeThrough(transform)
    const reader = outputStream.getReader()
    const decoder = new TextDecoder()
    let output = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        output += decoder.decode(value, { stream: true })
      }
    } finally {
      reader.releaseLock()
    }

    expect(output).toContain('Hello')
    expect(output).toContain('content_block_delta')
  })
})
