/**
 * HeuristicToolParser - Stateful parser for raw text tool calls.
 *
 * Some OpenAI-compatible models emit tool calls as text rather than structured
 * chunks. This parser converts the common `● <function=...>` form into
 * Anthropic-style `tool_use` blocks. It also detects JSON-style WebFetch/WebSearch
 * tool calls.
 */

import { randomUUID } from 'node:crypto'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolUse {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, string>
}

const ParserState = {
  TEXT: 'text',
  MATCHING_FUNCTION: 'matching_function',
  PARSING_PARAMETERS: 'parsing_parameters',
} as const

type ParserState = (typeof ParserState)[keyof typeof ParserState]

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FUNC_START_PATTERN = /●\s*<function=([^>]+)>/
const PARAM_PATTERN = /<parameter=([^>]+)>(.*?)(?:<\/parameter>|$)/gs
const WEB_TOOL_JSON_PATTERN = /(?:use\s+)?(WebFetch|WebSearch)\b[\s\S]*?(\{[\s\S]*?\})/gi

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export class HeuristicToolParser {
  private state: ParserState = ParserState.TEXT
  private buffer = ''
  private currentToolId: string | null = null
  private currentFunctionName: string | null = null
  private currentParameters: Record<string, string> = {}

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Feed text and return safe text plus detected tool calls.
   */
  feed(text: string): { filtered: string; tools: ToolUse[] } {
    this.buffer += text
    this.buffer = this.stripControlTokens(this.buffer)

    const detectedTools: ToolUse[] = []
    const filteredOutputParts: string[] = []

    // First pass: detect JSON-style WebFetch/WebSearch tool calls
    this.buffer = this.extractWebToolJsonCalls(this.buffer, detectedTools)

    // Second pass: parse ● <function=...> format
    while (true) {
      if (this.state === ParserState.TEXT) {
        const idx = this.buffer.indexOf('●')
        if (idx !== -1) {
          filteredOutputParts.push(this.buffer.slice(0, idx))
          this.buffer = this.buffer.slice(idx)
          this.state = ParserState.MATCHING_FUNCTION
        } else {
          // Check for incomplete control token at tail
          const safePrefix = this.splitIncompleteControlTokenTail()
          if (safePrefix) {
            filteredOutputParts.push(safePrefix)
            break
          }
          filteredOutputParts.push(this.buffer)
          this.buffer = ''
          break
        }
      }

      if (this.state === ParserState.MATCHING_FUNCTION) {
        const match = FUNC_START_PATTERN.exec(this.buffer)
        if (match) {
          this.currentFunctionName = match[1].trim()
          this.currentToolId = this.generateToolId()
          this.currentParameters = {}
          this.buffer = this.buffer.slice(match.index + match[0].length)
          this.state = ParserState.PARSING_PARAMETERS
        } else if (this.buffer.length > 100) {
          // Abandon match attempt, emit first char and revert to TEXT
          filteredOutputParts.push(this.buffer[0])
          this.buffer = this.buffer.slice(1)
          this.state = ParserState.TEXT
        } else {
          break
        }
      }

      if (this.state === ParserState.PARSING_PARAMETERS) {
        let finishedToolCall = false

        while (true) {
          const paramMatch = PARAM_PATTERN.exec(this.buffer)
          PARAM_PATTERN.lastIndex = 0 // Reset for next iteration

          if (paramMatch && paramMatch[0].includes('</parameter>')) {
            const preMatchText = this.buffer.slice(0, paramMatch.index)
            if (preMatchText) {
              filteredOutputParts.push(preMatchText)
            }
            const key = paramMatch[1].trim()
            const val = paramMatch[2].trim()
            this.currentParameters[key] = val
            this.buffer = this.buffer.slice(paramMatch.index + paramMatch[0].length)
          } else {
            break
          }
        }

        if (this.buffer.includes('●')) {
          const idx = this.buffer.indexOf('●')
          if (idx > 0) {
            filteredOutputParts.push(this.buffer.slice(0, idx))
            this.buffer = this.buffer.slice(idx)
          }
          finishedToolCall = true
        } else if (this.buffer.length > 0 && !this.buffer.trim().startsWith('<')) {
          if (!this.buffer.includes('<parameter=')) {
            filteredOutputParts.push(this.buffer)
            this.buffer = ''
            finishedToolCall = true
          }
        } else if (this.buffer.length === 0 && Object.keys(this.currentParameters).length > 0) {
          finishedToolCall = true
        }

        if (finishedToolCall) {
          detectedTools.push({
            type: 'tool_use',
            id: this.currentToolId ?? this.generateToolId(),
            name: this.currentFunctionName!,
            input: { ...this.currentParameters },
          })
          this.state = ParserState.TEXT
        } else {
          break
        }
      }
    }

    return { filtered: filteredOutputParts.join(''), tools: detectedTools }
  }

  /**
   * Flush any remaining tool call in the buffer.
   */
  flush(): ToolUse[] {
    this.buffer = this.stripControlTokens(this.buffer)
    const detectedTools: ToolUse[] = []

    if (this.state === ParserState.PARSING_PARAMETERS) {
      const partialMatches = this.buffer.matchAll(/<parameter=([^>]+)>(.*)$/gs)
      for (const match of partialMatches) {
        const key = match[1].trim()
        const val = match[2].trim()
        this.currentParameters[key] = val
      }

      detectedTools.push({
        type: 'tool_use',
        id: this.currentToolId ?? this.generateToolId(),
        name: this.currentFunctionName ?? 'unknown',
        input: { ...this.currentParameters },
      })
      this.state = ParserState.TEXT
      this.buffer = ''
    }

    return detectedTools
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private stripControlTokens(text: string): string {
    // Remove control tokens like <|...|>
    return text.replace(/<\|[^|]{1,80}\|>/g, '')
  }

  private splitIncompleteControlTokenTail(): string {
    const start = this.buffer.lastIndexOf('<|')
    if (start === -1) return ''
    const end = this.buffer.indexOf('|>', start)
    if (end !== -1) return ''

    const prefix = this.buffer.slice(0, start)
    this.buffer = this.buffer.slice(start)
    return prefix
  }

  private extractWebToolJsonCalls(
    text: string,
    detectedTools: ToolUse[]
  ): string {
    const matches = text.matchAll(WEB_TOOL_JSON_PATTERN)
    let remaining = text

    for (const match of matches) {
      try {
        const toolName = match[1]
        const jsonStr = match[2]
        const toolInput = JSON.parse(jsonStr) as Record<string, unknown>

        if (typeof toolInput !== 'object' || toolInput === null) continue
        if (toolName === 'WebFetch' && !('url' in toolInput)) continue
        if (toolName === 'WebSearch' && !('query' in toolInput)) continue

        detectedTools.push({
          type: 'tool_use',
          id: this.generateToolId(),
          name: toolName,
          input: Object.entries(toolInput).reduce((acc, [key, val]) => {
            acc[key] = String(val)
            return acc
          }, {} as Record<string, string>),
        })

        // Remove this match from remaining text
        remaining = remaining.replace(match[0], '')
      } catch {
        // ignore invalid JSON
      }
    }

    return remaining
  }

  private generateToolId(): string {
    return `toolu_heuristic_${randomUUID().slice(0, 8)}`
  }
}
