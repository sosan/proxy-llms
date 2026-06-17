import type { GenericPayload, ChatMessage, MessageContentPart } from '../interfaces/general'
import { logger } from '../utils/logger'

// --- Helpers ---------------------------------------------------------------

export function transformClaudeToOpenAI(body: Record<string, unknown>): GenericPayload {
  logger.debug('[transformClaudeToOpenAI] Starting transformation', { keys: Object.keys(body) })

  const result: GenericPayload = {
    model: body.model as string,
  }

  // max_tokens
  if (typeof body.max_tokens === 'number') {
    result.max_tokens = body.max_tokens
  }

  // temperature
  if (typeof body.temperature === 'number') {
    result.temperature = body.temperature
  }

  // top_p
  if (typeof body.top_p === 'number') {
    result.top_p = body.top_p
  }

  // stream
  if (typeof body.stream === 'boolean') {
    result.stream = body.stream
  }

  const messages: ChatMessage[] = []

  if (body.system !== undefined) {
    const systemContent = extractSystemContent(body.system)
    if (systemContent) {
      messages.push({ role: 'system', content: systemContent })
    }
  }

  if (Array.isArray(body.messages)) {
    for (const msg of body.messages) {
      const converted = convertClaudeMessage(msg)
      if (converted) {
        if (Array.isArray(converted)) {
          messages.push(...converted)
        } else {
          messages.push(converted)
        }
      }
    }
  }

  result.messages = messages

  // ✅ FIX: omitir tools si el array está vacío
  if (Array.isArray(body.tools) && body.tools.length > 0) {
    result.tools = body.tools.map((tool: unknown) => convertClaudeTool(tool))
  }

  if (body.tool_choice !== undefined) {
    result.tool_choice = convertClaudeToolChoice(body.tool_choice)
  }

  const knownKeys = new Set([
    'model', 'messages', 'max_tokens', 'temperature', 'top_p', 'stream',
    'system', 'tools', 'tool_choice', 'provider', 'content',
  ])
  const excludedClaudeKeys = new Set([
    'thinking',
    'context_management',
    'output_config',
    'metadata',
  ])
  for (const [key, value] of Object.entries(body)) {
    if (!knownKeys.has(key) && !excludedClaudeKeys.has(key) && value !== undefined) {
      result[key] = value
    }
  }

  logger.debug('[transformClaudeToOpenAI] Transformation complete', {
    messageCount: messages.length,
    hasTools: !!result.tools,
  })

  return result
}


function extractSystemContent(system: unknown): string | null {
  if (typeof system === 'string') {
    return system
  }
  if (Array.isArray(system)) {
    return system.map((s: unknown) => {
      if (typeof s === 'string') return s
      if (s && typeof s === 'object' && 'text' in s) {
        return (s as Record<string, unknown>).text as string
      }
      return ''
    }).join('\n')
  }
  return null
}

function convertClaudeMessage(msg: unknown): ChatMessage | ChatMessage[] | null {
  if (!msg || typeof msg !== 'object') return null

  const m = msg as Record<string, unknown>
  const role = m.role === 'user' || m.role === 'tool' ? 'user' : 'assistant'

  // String content
  if (typeof m.content === 'string') {
    return { role, content: m.content }
  }

  // Array content (Claude blocks)
  if (Array.isArray(m.content)) {
    const parts: { type: 'text' | 'image' | 'image_url'; text?: string; image_url?: { url: string } }[] = []
    const toolCalls: { id: string; type: string; function: { name: string; arguments: string } }[] = []
    const toolResults: ChatMessage[] = []

    for (const block of m.content) {
      if (!block || typeof block !== 'object') continue
      const b = block as Record<string, unknown>

      switch (b.type) {
        case 'text':
          if (typeof b.text === 'string') {
            parts.push({ type: 'text', text: b.text })
          }
          break

        case 'image':
          if (b.source && typeof b.source === 'object') {
            const source = b.source as Record<string, unknown>
            if (source.type === 'base64' && typeof source.data === 'string' && typeof source.media_type === 'string') {
              parts.push({
                type: 'image_url',
                image_url: {
                  url: `data:${source.media_type};base64,${source.data}`,
                },
              })
            }
          }
          break

        case 'tool_use':
          if (typeof b.id === 'string' && typeof b.name === 'string') {
            toolCalls.push({
              id: b.id,
              type: 'function',
              function: {
                name: b.name,
                arguments: JSON.stringify((b.input as Record<string, unknown>) ?? {}),
              },
            })
          }
          break

        case 'tool_result':
          if (typeof b.tool_use_id === 'string') {
            let resultContent = ''
            if (typeof b.content === 'string') {
              resultContent = b.content
            } else if (Array.isArray(b.content)) {
              resultContent = b.content
                .filter((c: unknown) => (c as Record<string, unknown>).type === 'text')
                .map((c: unknown) => (c as Record<string, unknown>).text)
                .join('\n')
            } else if (b.content) {
              resultContent = JSON.stringify(b.content)
            }
            toolResults.push({
              role: 'tool',
              tool_call_id: b.tool_use_id,
              content: resultContent,
            } as ChatMessage)
          }
          break
      }
    }

    // If tool results exist, return them + text as user message
    if (toolResults.length > 0) {
      const output: ChatMessage[] = [...toolResults]
      if (parts.length > 0) {
        const textContent = parts.length === 1 && parts[0].type === 'text'
          ? parts[0].text
          : parts
        output.push({ role: 'user', content: textContent ?? '' })
      }
      return output
    }

    // If tool calls exist, return assistant message with tool_calls
    if (toolCalls.length > 0) {
      const textPart = parts.length > 0
        ? (parts.length === 1 && parts[0].type === 'text' ? parts[0].text : parts)
        : undefined
      const assistantMsg: ChatMessage & { tool_calls?: unknown[] } = { role: 'assistant', content: textPart ?? '' }
      if (textPart === undefined) {
        assistantMsg.content = ''
      }
      assistantMsg.tool_calls = toolCalls
      return assistantMsg
    }

    // Plain content
    if (parts.length > 0) {
      return {
        role,
        content: parts.length === 1 && parts[0].type === 'text' ? parts[0].text ?? '' : parts,
      }
    }

    return { role, content: '' }
  }

  return null
}

function convertClaudeTool(tool: unknown): Record<string, unknown> {
  if (!tool || typeof tool !== 'object') {
    return { type: 'function', function: { name: '', description: '', parameters: { type: 'object', properties: {} } } }
  }

  const t = tool as Record<string, unknown>
  return {
    type: 'function',
    function: {
      name: t.name ?? '',
      description: String(t.description ?? ''),
      parameters: t.input_schema ?? { type: 'object', properties: {} },
    },
  }
}

function convertClaudeToolChoice(choice: unknown): unknown {
  if (!choice) return 'auto'
  if (typeof choice === 'string') return choice
  if (typeof choice === 'object' && choice !== null) {
    const c = choice as Record<string, unknown>
    switch (c.type) {
      case 'auto': return 'auto'
      case 'any': return 'required'
      case 'tool':
        return { type: 'function', function: { name: c.name } }
      default:
        return 'auto'
    }
  }
  return 'auto'
}


// parer txt plain to json

/**
 * Parses a Claude Code execution log (plain text with internal delimiters)
 * into a Claude API-compatible message payload.
 *
 * Input example:
 *   "Voy a revisar los tests... <|tool_calls_section_begin|>
 *    <|tool_call_begin|> functions.Read:0 <|tool_call_argument_begin|>
 *    {"file_path": "..."} <|tool_call_end|> <|tool_calls_section_end|>"
 *
 * Output example:
 *   {
 *     messages: [{
 *       role: 'assistant',
 *       content: [
 *         { type: 'text', text: 'Voy a revisar los tests...' },
 *         { type: 'tool_use', id: 'tool_call_0', name: 'Read', input: { file_path: '...' } }
 *       ]
 *     }]
 *   }
 */
export function parseClaudeCodeLog(raw: string): GenericPayload {
  const messages: ChatMessage[] = []
  const content: MessageContentPart[] = []

  // 1. Extraer texto anterior a la sección de tool calls
  const textBeforeTools = raw
    .split('<|tool_calls_section_begin|>')[0]
    .trim()

  if (textBeforeTools) {
    content.push({ type: 'text', text: textBeforeTools })
  }

  // 2. Extraer cada tool call con su nombre, índice y argumentos
  const toolCallRegex =
    /<\|tool_call_begin\|>\s*functions\.(\w+):(\d+)\s*<\|tool_call_argument_begin\|>([\s\S]*?)<\|tool_call_end\|>/g

  for (const match of raw.matchAll(toolCallRegex)) {
    const [, toolName, index, rawArgs] = match

    let parsedInput: Record<string, unknown> = {}
    try {
      parsedInput = JSON.parse(rawArgs.trim())
    } catch {
      // Si los argumentos no son JSON válido, los guardamos como string
      parsedInput = { _raw: rawArgs.trim() }
    }

    content.push({
      type: 'tool_use',
      id: `tool_call_${index}`,
      name: toolName,
      input: parsedInput,
    })
  }

  // 3. Si hay contenido, construir el mensaje assistant
  if (content.length > 0) {
    messages.push({
      role: 'assistant',
      // Si solo hay texto y ningún tool_use, simplificar a string
      content:
        content.length === 1 && content[0].type === 'text'
          ? content[0].text ?? ''
          : content,
    })
  }

  return { messages }
}


