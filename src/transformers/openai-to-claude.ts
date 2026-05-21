import { logger } from '../utils/logger'

/**
 * Transforms an OpenAI-format response into a Claude-format response.
 * Supports:
 * - OpenAI's 'choices' with messages → Claude's 'content' blocks
 * - OpenAI's 'tool_calls' → Claude's 'tool_use' blocks
 * - OpenAI's streaming format → Claude's streaming format
 */
export function transformOpenAIToClaude(openaiResponse: Record<string, unknown>): Record<string, unknown> {
  logger.debug('[transformOpenAIToClaude] Starting transformation')

  const id = (openaiResponse.id as string) ?? 'msg_' + crypto.randomUUID().slice(0, 8)
  const model = (openaiResponse.model as string) ?? 'unknown'

  // Handle streaming chunks (partial responses)
  if (openaiResponse.choices === undefined && openaiResponse.delta) {
    return transformOpenAIStreamChunkToClaude(openaiResponse)
  }

  const choices = openaiResponse.choices as Array<Record<string, unknown>> ?? []
  if (choices.length === 0) {
    return {
      id,
      type: 'message',
      role: 'assistant',
      model,
      content: [],
      stop_reason: 'end_turn',
      usage: openaiResponse.usage ?? {},
    }
  }

  const choice = choices[0]
  const message = choice.message as Record<string, unknown> ?? {}

  // Build Claude content blocks
  const content: Array<Record<string, unknown>> = []

  // Text content
  if (typeof message.content === 'string' && message.content) {
    content.push({ type: 'text', text: message.content })
  }

  // Tool calls → tool_use blocks
  const toolCalls = message.tool_calls as Array<Record<string, unknown>> ?? []
  for (const toolCall of toolCalls) {
    const functionCall = toolCall.function as Record<string, unknown> ?? {}
    let input: Record<string, unknown> = {}
    try {
      if (typeof functionCall.arguments === 'string') {
        input = JSON.parse(functionCall.arguments)
      }
    } catch {
      input = { raw: functionCall.arguments }
    }

    content.push({
      type: 'tool_use',
      id: toolCall.id ?? `tool_${crypto.randomUUID().slice(0, 8)}`,
      name: functionCall.name ?? 'unknown',
      input,
    })
  }

  // Determine stop reason
  let stopReason = 'end_turn'
  const finishReason = choice.finish_reason as string
  if (finishReason === 'tool_calls') {
    stopReason = 'tool_use'
  } else if (finishReason === 'length') {
    stopReason = 'max_tokens'
  } else if (finishReason === 'stop') {
    stopReason = 'end_turn'
  }

  return {
    id,
    type: 'message',
    role: 'assistant',
    model,
    content,
    stop_reason: stopReason,
    usage: openaiResponse.usage ?? {},
    ...(openaiResponse.created ? { created_at: new Date(openaiResponse.created as number * 1000).toISOString() } : {}),
  }
}

/**
 * Transforms an OpenAI streaming chunk into Claude streaming format.
 * For SSE streams, each chunk is processed individually.
 */
export function transformOpenAIStreamChunkToClaude(chunk: Record<string, unknown>): Record<string, unknown> {
  const delta = chunk.delta as Record<string, unknown> ?? {}
  const id = (chunk.id as string) ?? 'msg_' + crypto.randomUUID().slice(0, 8)

  // Build Claude content block from delta
  const content: Array<Record<string, unknown>> = []

  if (typeof delta.content === 'string' && delta.content) {
    content.push({ type: 'text', text: delta.content })
  }

  // Handle tool call deltas in stream
  const toolCalls = delta.tool_calls as Array<Record<string, unknown>> ?? []
  for (const toolCall of toolCalls) {
    const functionCall = toolCall.function as Record<string, unknown> ?? {}
    content.push({
      type: 'tool_use',
      id: toolCall.id ?? `tool_${crypto.randomUUID().slice(0, 8)}`,
      name: functionCall.name ?? 'unknown',
      input: {},
    })
  }

  return {
    id,
    type: 'message',
    role: 'assistant',
    model: chunk.model as string ?? 'unknown',
    content,
    stop_reason: chunk.finish_reason ?? null,
  }
}

/**
 * Transforms an OpenAI tool result into Claude tool_result format.
 */
export function transformOpenAIToolResultToClaude(
  toolCallId: string,
  content: string
): Record<string, unknown> {
  return {
    type: 'tool_result',
    tool_use_id: toolCallId,
    content,
  }
}
