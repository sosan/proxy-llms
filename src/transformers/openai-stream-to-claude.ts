// import { logger } from '../utils/logger'

import { Logger } from "../utils/logger"

/** Local type: only used within this transformer */
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

/** Local type: only used within this transformer */
interface ClaudeSSEEvent {
  event: string
  data: Record<string, unknown>
}

interface StreamState {
  messageStarted: boolean
  blockOpen: boolean
  currentBlockIndex: number
  finished: boolean,
  toolCallBlocks: Map<number, { id: string; name: string; blockIndex: number }>
}

/**
 * Transform an OpenAI SSE stream into a Claude SSE stream.
 */
export function createOpenAIStreamToClaudeTransformStream(
  logger: Logger
): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ''
  let messageIndex = 0
  const state: StreamState = {
    messageStarted: false,
    blockOpen: false,
    currentBlockIndex: 0,
    finished: false,
    toolCallBlocks: new Map()
  }

  return new TransformStream({
    transform: (chunk, controller) => {
      if (state.finished) return
      const text = decoder.decode(chunk, { stream: true })
      buffer += text
      const events = parseSSEEvents(buffer)
      buffer = events.remainder

      for (const sseEvent of events.events) {
        const claudeEvents = transformSSEEvent(sseEvent, state)
        for (const claudeEvent of claudeEvents) {
          controller.enqueue(encoder.encode(`event: ${claudeEvent.event}\ndata: ${JSON.stringify(claudeEvent.data)}\n\n`))
        }
        messageIndex++
      }
    },
    flush: (controller) => {
      if (state.finished) return

      if (buffer.trim()) {
        const events = parseSSEEvents(buffer + '\n')
        for (const sseEvent of events.events) {
          const claudeEvents = transformSSEEvent(sseEvent, state)
          for (const claudeEvent of claudeEvents) {
            controller.enqueue(encoder.encode(`event: ${claudeEvent.event}\ndata: ${JSON.stringify(claudeEvent.data)}\n\n`))
          }
        }
      }

      if (state.blockOpen) {
        controller.enqueue(encoder.encode(
          `event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: state.currentBlockIndex })}\n\n`
        ))
        state.blockOpen = false
      }

      if (state.toolCallBlocks.size > 0) {
        for (const [, block] of state.toolCallBlocks) {
          controller.enqueue(encoder.encode(
            `event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: block.blockIndex })}\n\n`
          ))
        }
        state.toolCallBlocks.clear()
      }

      if (!state.messageStarted) {
        state.messageStarted = true
        controller.enqueue(encoder.encode(
          `event: message_start\ndata: ${JSON.stringify({ type: 'message_start', message: { id: `msg_${crypto.randomUUID().slice(0, 8)}`, type: 'message', role: 'assistant', model: 'unknown', content: [], stop_reason: null, stop_sequence: null } })}\n\n`
        ))
      }

      // always emit message_delta + message_stop
      if (state.messageStarted && !state.finished) {
        controller.enqueue(encoder.encode(
          `event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: {} })}\n\n`
        ))
        controller.enqueue(encoder.encode(
          `event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`
        ))
        state.finished = true
      }

      logger.debug('[SSE flush] state:', {
        messageStarted: state.messageStarted,
        blockOpen: state.blockOpen,
        finished: state.finished,
        toolCallBlocks: state.toolCallBlocks.size,
      })
    }
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
    state: StreamState
  ): ClaudeSSEEvent[] {
    if (event && Object.keys(event).length > 0) {
      const choice = event.choices?.[0]
      if (choice?.delta?.tool_calls) {
        logger.debug('[SSE] tool_calls delta:', JSON.stringify(choice.delta.tool_calls))
      }
      if (choice?.delta?.content) {
        logger.debug('[SSE] text delta:', choice.delta.content.slice(0, 50))
      }
      if (choice?.finish_reason) {
        logger.debug('[SSE] finish_reason:', choice.finish_reason)
      }
    }

    if (!event || Object.keys(event).length === 0) {
      const claudeEvents: ClaudeSSEEvent[] = []
      if (!state.messageStarted) {
        state.messageStarted = true
        claudeEvents.push({
          event: 'message_start',
          data: {
            type: 'message_start',
            message: {
              id: `msg_${crypto.randomUUID().slice(0, 8)}`,
              type: 'message', role: 'assistant', model: 'unknown',
              content: [], stop_reason: null, stop_sequence: null,
            },
          },
        })
      }
      if (state.blockOpen) {
        claudeEvents.push({ event: 'content_block_stop', data: { type: 'content_block_stop', index: state.currentBlockIndex } })
        state.blockOpen = false
      }
      claudeEvents.push({ event: 'message_delta', data: { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: {} } })
      claudeEvents.push({ event: 'message_stop', data: { type: 'message_stop' } })
      state.finished = true
      return claudeEvents
    }

    const claudeEvents: ClaudeSSEEvent[] = []
    const choice = event.choices?.[0]

    // message_start en primer chunk válido
    if (!state.messageStarted && (event.id || event.model || event.choices !== undefined)) {
      state.messageStarted = true
      claudeEvents.push({
        event: 'message_start',
        data: {
          type: 'message_start',
          message: {
            id: event.id ?? `msg_${crypto.randomUUID().slice(0, 8)}`,
            type: 'message', role: 'assistant',
            model: event.model ?? 'unknown',
            content: [], stop_reason: null, stop_sequence: null,
          },
        },
      })
    }

    if (!choice) return claudeEvents

    const delta = choice.delta

    // -- Text ----------------------------------------------------------------
    if (delta?.content) {
      // Abrir bloque de texto si no hay ninguno abierto
      if (!state.blockOpen) {
        state.blockOpen = true
        claudeEvents.push({
          event: 'content_block_start',
          data: {
            type: 'content_block_start',
            index: state.currentBlockIndex,
            content_block: { type: 'text', text: '' },
          },
        })
      }
      claudeEvents.push({
        event: 'content_block_delta',
        data: {
          type: 'content_block_delta',
          index: state.currentBlockIndex,
          delta: { type: 'text_delta', text: delta.content },
        },
      })
    }

    // -- Tool calls -----------------------------------------------------------
    if (delta?.tool_calls && delta.tool_calls.length > 0) {
      // Cerrar bloque de texto si estaba abierto
      if (state.blockOpen) {
        claudeEvents.push({
          event: 'content_block_stop',
          data: { type: 'content_block_stop', index: state.currentBlockIndex },
        })
        state.blockOpen = false
        state.currentBlockIndex++
      }

      for (const tc of delta.tool_calls) {
        const tcIndex = tc.index ?? 0

        // Primera vez que vemos este tool call — abrir bloque tool_use
        if (!state.toolCallBlocks.has(tcIndex)) {
          const blockIndex = state.currentBlockIndex
          state.toolCallBlocks.set(tcIndex, {
            id: tc.id ?? `call_${crypto.randomUUID().slice(0, 8)}`,
            name: tc.function?.name ?? '',
            blockIndex,
          })
          state.currentBlockIndex++
          claudeEvents.push({
            event: 'content_block_start',
            data: {
              type: 'content_block_start',
              index: blockIndex,
              content_block: {
                type: 'tool_use',
                id: tc.id ?? `call_${crypto.randomUUID().slice(0, 8)}`,
                name: tc.function?.name ?? '',
                input: {},
              },
            },
          })
        }

        // Streaming de argumentos JSON parciales
        if (tc.function?.arguments) {
          const block = state.toolCallBlocks.get(tcIndex)!
          claudeEvents.push({
            event: 'content_block_delta',
            data: {
              type: 'content_block_delta',
              index: block.blockIndex,
              delta: { type: 'input_json_delta', partial_json: tc.function.arguments },
            },
          })
        }
      }
    }

    // -- finish_reason --------------------------------------------------------
    if (choice.finish_reason) {
      // Cerrar bloque de texto si quedó abierto
      if (state.blockOpen) {
        claudeEvents.push({
          event: 'content_block_stop',
          data: { type: 'content_block_stop', index: state.currentBlockIndex },
        })
        state.blockOpen = false
      }

      // Cerrar todos los bloques de tool calls abiertos
      for (const [, block] of state.toolCallBlocks) {
        claudeEvents.push({
          event: 'content_block_stop',
          data: { type: 'content_block_stop', index: block.blockIndex },
        })
      }
      state.toolCallBlocks.clear()

      const stopReason = choice.finish_reason === 'tool_calls' ? 'tool_use'
        : choice.finish_reason === 'stop' ? 'end_turn'
          : choice.finish_reason

      claudeEvents.push({
        event: 'message_delta',
        data: {
          type: 'message_delta',
          delta: { stop_reason: stopReason },
          usage: {},
        },
      })
      claudeEvents.push({ event: 'message_stop', data: { type: 'message_stop' } })
      state.finished = true
    }

    if (claudeEvents.length > 0) {
      for (const e of claudeEvents) {
        logger.debug('[→Claude]', e.event, JSON.stringify(e.data).slice(0, 100))
      }
    }

    return claudeEvents
  }


}
