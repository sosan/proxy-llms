import { logger } from '../utils/logger'

interface OpenAIStreamChunk {
  id?: string
  choices?: Array<{
    delta?: {
      content?: string | null
      role?: string | null
      tool_calls?: Array<{
        index?: number
        id?: string
        type?: string
        function?: { name?: string; arguments?: string }
      }>
    }
    finish_reason?: string | null
  }>
  model?: string
}

interface ClaudeSSEEvent {
  event: string
  data: Record<string, unknown>
}

/**
 * Transform an OpenAI SSE stream into a Claude SSE stream.
 */
export function createOpenAIStreamToClaudeTransformStream(
  logContext: ReturnType<typeof logger.withEnv>
): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ''
  let messageIndex = 0
  let currentBlockIndex = 0

  return new TransformStream({
    transform: (chunk, controller) => {
      const text = decoder.decode(chunk, { stream: true })
      buffer += text
      const events = parseSSEEvents(buffer)
      buffer = events.remainder

      for (const sseEvent of events.events) {
        const claudeEvents = transformSSEEvent(sseEvent, messageIndex, currentBlockIndex)
        for (const claudeEvent of claudeEvents) {
          controller.enqueue(encoder.encode(`event: ${claudeEvent.event}\ndata: ${JSON.stringify(claudeEvent.data)}\n\n`))
        }
      }
    },
    flush: (controller) => {
      if (buffer.trim()) {
        const events = parseSSEEvents(buffer + '\n')
        for (const sseEvent of events.events) {
          const claudeEvents = transformSSEEvent(sseEvent, messageIndex, currentBlockIndex)
          for (const claudeEvent of claudeEvents) {
            controller.enqueue(encoder.encode(`event: ${claudeEvent.event}\ndata: ${JSON.stringify(claudeEvent.data)}\n\n`))
          }
        }
      }
    },
  })

  function parseSSEEvents(text: string): { events: OpenAIStreamChunk[]; remainder: string } {
    const lines = text.split('\n')
    const events: OpenAIStreamChunk[] = []
    let remainder = ''

    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim()
      if (!line) continue
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim()
        if (data === '[DONE]') {
          events.push({} as OpenAIStreamChunk) // Marker for DONE
        } else {
          try {
            events.push(JSON.parse(data))
          } catch {
            // ignore invalid json
          }
        }
      }
    }

    remainder = lines[lines.length - 1]
    return { events, remainder }
  }

  function transformSSEEvent(
    event: OpenAIStreamChunk,
    messageIndex: number,
    currentBlockIndex: number
  ): ClaudeSSEEvent[] {
    if (!event || Object.keys(event).length === 0) {
      // DONE event
      return [{ event: 'message_stop', data: { type: 'message_stop' } }]
    }

    const claudeEvents: ClaudeSSEEvent[] = []
    const choice = event.choices?.[0]

    if (!choice) return claudeEvents

    // message_start on first delta
    if (messageIndex === 0) {
      claudeEvents.push({
        event: 'message_start',
        data: {
          type: 'message_start',
          message: {
            id: event.id ?? `msg_${crypto.randomUUID().slice(0, 8)}`,
            type: 'message',
            role: 'assistant',
            model: event.model ?? 'unknown',
            content: [],
            stop_reason: null,
            stop_sequence: null,
          },
        },
      })
    }

    // content_block_start
    if (choice.delta?.content || choice.delta?.tool_calls) {
      claudeEvents.push({
        event: 'content_block_start',
        data: {
          type: 'content_block_start',
          index: currentBlockIndex,
          content_block: { type: 'text', text: '' },
        },
      })
    }

    // content_block_delta
    if (choice.delta?.content) {
      claudeEvents.push({
        event: 'content_block_delta',
        data: {
          type: 'content_block_delta',
          index: currentBlockIndex,
          delta: { type: 'text_delta', text: choice.delta.content },
        },
      })
    }

    // content_block_stop
    if (choice.delta?.content || choice.delta?.tool_calls) {
      claudeEvents.push({
        event: 'content_block_stop',
        data: {
          type: 'content_block_stop',
          index: currentBlockIndex,
        },
      })
      currentBlockIndex++
    }

    // message_delta / message_stop on finish_reason
    if (choice.finish_reason) {
      claudeEvents.push({
        event: 'message_delta',
        data: {
          type: 'message_delta',
          delta: { stop_reason: choice.finish_reason === 'stop' ? 'end_turn' : choice.finish_reason },
          usage: {},
        },
      })
      claudeEvents.push({
        event: 'message_stop',
        data: { type: 'message_stop' },
      })
    }

    messageIndex++
    return claudeEvents
  }
}
