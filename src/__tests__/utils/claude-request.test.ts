import { describe, it, expect } from 'vitest'
import { parseClaudeRequest, isParseError } from '../../utils/claude-request'

describe('parseClaudeRequest', () => {
  it('returns error when payload is undefined', () => {
    const result = parseClaudeRequest(undefined)
    expect(isParseError(result)).toBe(true)
    if (isParseError(result)) {
      expect(result.response.status).toBe(400)
    }
  })

  it('returns error when model is missing', async () => {
    const result = parseClaudeRequest({})
    expect(isParseError(result)).toBe(true)
    if (isParseError(result)) {
      expect(result.response.status).toBe(400)
      const body = JSON.parse(await result.response.text()) as { success: boolean; error: string }
      expect(body.success).toBe(false)
      expect(body.error).toMatch(/model/i)
    }
  })

  it('returns error when model has no "/" separator', async () => {
    const result = parseClaudeRequest({ model: 'just-an-alias' })
    expect(isParseError(result)).toBe(true)
    if (isParseError(result)) {
      expect(result.response.status).toBe(400)
    }
  })

  it('returns error for unknown provider prefix', async () => {
    const result = parseClaudeRequest({ model: 'unknown-provider/some-model' })
    expect(isParseError(result)).toBe(true)
    if (isParseError(result)) {
      expect(result.response.status).toBe(400)
      const body = JSON.parse(await result.response.text()) as { error: string }
      expect(body.error).toContain('Unknown provider')
      expect(body.error).toContain('unknown-provider')
    }
  })

  it('returns { providerDC, payload } for valid "provider/model"', () => {
    const payload = { model: 'nvidia/test-model', messages: [{ role: 'user' as const, content: 'hi' }] }
    const result = parseClaudeRequest(payload)
    expect(isParseError(result)).toBe(false)
    if (!isParseError(result)) {
      expect(result.providerDC).toBe('nvidia')
      expect(result.payload).toEqual(payload)
    }
  })

  it('extracts provider from first segment of model', () => {
    const cases: Array<[string, string]> = [
      ['openrouter/anthropic/claude', 'openrouter'],
      ['lmstudio/local-model', 'lmstudio'],
      ['ollama/llama3', 'ollama'],
    ]
    for (const [model, expectedProvider] of cases) {
      const result = parseClaudeRequest({ model })
      expect(isParseError(result)).toBe(false)
      if (!isParseError(result)) {
        expect(result.providerDC).toBe(expectedProvider)
      }
    }
  })
})

describe('isParseError', () => {
  it('returns true for error shape', () => {
    const errResult = { error: true as const, response: new Response('{}', { status: 400 }) }
    expect(isParseError(errResult)).toBe(true)
  })

  it('returns false for success shape', () => {
    const okResult = { providerDC: 'nvidia', payload: { model: 'nvidia/x' } }
    expect(isParseError(okResult)).toBe(false)
  })
})
