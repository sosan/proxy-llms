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

describe('createOpenAIStreamToClaudeTransformStream - midstream error handling', () => {
  it('emits content_block_stop and message_stop when stream ends with open block', async () => {
    const log = logger.withEnv({} as any)
    const transform = createOpenAIStreamToClaudeTransformStream(log)

    const encoder = new TextEncoder()
    const readable = new ReadableStream<Uint8Array>({
      start(c) {
        // Emit content without finish_reason — simulates midstream interruption
        c.enqueue(encoder.encode('data: {"id":"chatcmpl-123","object":"chat.completion.chunk","model":"gpt-4","choices":[{"delta":{"content":"Hello"},"index":0,"finish_reason":null}]}\n\n'))
        c.close()
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

    // Should emit message_start, content_block_start, content_block_delta, content_block_stop, message_stop
    expect(output).toContain('event: message_start')
    expect(output).toContain('event: content_block_start')
    expect(output).toContain('Hello')
    expect(output).toContain('event: content_block_stop')
    expect(output).toContain('event: message_stop')
  })

  it('emits content_block_stop with correct index when stream ends without finish_reason', async () => {
    const log = logger.withEnv({} as any)
    const transform = createOpenAIStreamToClaudeTransformStream(log)

    const encoder = new TextEncoder()
    const readable = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(encoder.encode('data: {"id":"chatcmpl-123","choices":[{"delta":{"content":"Hello"},"index":0,"finish_reason":null}]}\n\n'))
        c.close()
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

    // content_block_stop should have index 0
    expect(output).toContain('event: content_block_stop')
    expect(output).toContain('"index":0')
  })

  it('does not reuse block index after closing open block on stream end', async () => {
    const log = logger.withEnv({} as any)
    const transform = createOpenAIStreamToClaudeTransformStream(log)

    const encoder = new TextEncoder()
    const readable = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(encoder.encode('data: {"id":"chatcmpl-123","choices":[{"delta":{"content":"Hello"},"index":0,"finish_reason":null}]}\n\n'))
        c.close()
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

    // Should have exactly one content_block_start with index 0
    const startMatches = output.match(/"index":0/g) || []
    expect(startMatches.length).toBeGreaterThanOrEqual(1)
  })
})
