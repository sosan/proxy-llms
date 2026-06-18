import { describe, it, expect } from 'vitest'
import { injectCaveman } from '../../../transformers/rtk/caveman'
import { CAVEMAN_PROMPTS } from '../../../transformers/rtk/cavemanPrompts'

describe('injectCaveman', () => {
  describe('OpenAI shape (default format)', () => {
    it('appends to existing system message string content', () => {
      const body = {
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'hi' },
        ],
      }
      injectCaveman(body, 'openai', 'full')
      const sys = body.messages[0].content as string
      expect(sys).toContain('You are helpful.')
      expect(sys).toContain(CAVEMAN_PROMPTS.full)
    })

    it('prepends a new system message when none exists', () => {
      const body = { messages: [{ role: 'user', content: 'hi' }] }
      injectCaveman(body, 'openai', 'lite')
      expect(body.messages[0].role).toBe('system')
      expect(body.messages[0].content).toBe(CAVEMAN_PROMPTS.lite)
    })

    it('appends to existing developer message', () => {
      const body = {
        messages: [
          { role: 'developer', content: 'Be terse.' },
          { role: 'user', content: 'hi' },
        ],
      }
      injectCaveman(body, 'openai', 'ultra')
      expect(body.messages[0].content).toContain('Be terse.')
      expect(body.messages[0].content).toContain(CAVEMAN_PROMPTS.ultra)
    })

    it('appends to array content via input_text part', () => {
      const body = {
        messages: [
          { role: 'system', content: [{ type: 'text', text: 'preface' }] },
          { role: 'user', content: 'hi' },
        ],
      }
      injectCaveman(body, 'openai', 'lite')
      const content = body.messages[0].content as Array<{ type: string; text: string }>
      expect(content[0]).toEqual({ type: 'text', text: 'preface' })
      expect(content[content.length - 1]).toEqual({ type: 'input_text', text: CAVEMAN_PROMPTS.lite })
    })

    it('handles Responses-style instructions string', () => {
      const body = { instructions: 'Existing instructions.' }
      injectCaveman(body, 'openai', 'full')
      expect(body.instructions).toContain('Existing instructions.')
      expect(body.instructions).toContain(CAVEMAN_PROMPTS.full)
    })

    it('handles Responses-style input array', () => {
      const body = {
        input: [
          { role: 'user', content: 'hi' },
        ],
      }
      injectCaveman(body, 'openai', 'lite')
      expect(body.input[0].role).toBe('system')
      expect(body.input[0].content).toBe(CAVEMAN_PROMPTS.lite)
    })

    it('handles Responses-style input with existing developer message', () => {
      const body = {
        input: [
          { role: 'developer', content: 'old' },
          { role: 'user', content: 'hi' },
        ],
      }
      injectCaveman(body, 'openai', 'lite')
      expect(body.input[0].content).toContain('old')
      expect(body.input[0].content).toContain(CAVEMAN_PROMPTS.lite)
    })
  })

  describe('Claude / Anthropic shape', () => {
    it('appends to system string', () => {
      const body = { system: 'Existing system.' }
      injectCaveman(body, 'claude', 'full')
      expect(body.system).toContain('Existing system.')
      expect(body.system).toContain(CAVEMAN_PROMPTS.full)
    })

    it('appends to system array', () => {
      const body = { system: [{ type: 'text', text: 'preface' }] }
      injectCaveman(body, 'anthropic', 'lite')
      const sys = body.system as Array<{ type: string; text: string }>
      expect(sys[0].text).toBe('preface')
      const last = sys[sys.length - 1]
      expect(last.text).toBe(CAVEMAN_PROMPTS.lite)
    })

    it('inserts before the last cache_control block in system array', () => {
      const body = {
        system: [
          { type: 'text', text: 'block-1' },
          { type: 'text', text: 'block-2', cache_control: { type: 'ephemeral' } },
        ],
      }
      injectCaveman(body, 'claude', 'full')
      const sys = body.system as Array<{ type: string; text: string; cache_control?: unknown }>
      expect(sys).toHaveLength(3)
      // The injected block should be inserted before the cache_control block
      expect(sys[1].text).toBe(CAVEMAN_PROMPTS.full)
      expect(sys[2].cache_control).toBeDefined()
    })

    it('assigns system when absent', () => {
      const body = {} as { system?: string | Array<{ type: string; text: string }> }
      injectCaveman(body as { system?: string }, 'claude', 'lite')
      expect(body.system).toBe(CAVEMAN_PROMPTS.lite)
    })

    it('treats "anthropic" format the same as "claude"', () => {
      const body = { system: 'base' }
      injectCaveman(body, 'anthropic', 'lite')
      expect(body.system).toContain('base')
      expect(body.system).toContain(CAVEMAN_PROMPTS.lite)
    })
  })

  describe('Gemini shape', () => {
    it('appends to systemInstruction.parts (camelCase)', () => {
      const body = {
        systemInstruction: { parts: [{ text: 'preface' }] },
      }
      injectCaveman(body, 'gemini', 'full')
      const parts = body.systemInstruction.parts
      expect(parts[0].text).toBe('preface')
      expect(parts[parts.length - 1].text).toBe(CAVEMAN_PROMPTS.full)
    })

    it('appends to system_instruction.parts (snake_case)', () => {
      const body = {
        system_instruction: { parts: [{ text: 'preface' }] },
      }
      injectCaveman(body, 'google', 'lite')
      const parts = body.system_instruction.parts
      expect(parts[parts.length - 1].text).toBe(CAVEMAN_PROMPTS.lite)
    })

    it('creates systemInstruction when absent', () => {
      const body = {} as Record<string, unknown>
      injectCaveman(body, 'vertex', 'lite')
      expect(body.systemInstruction).toEqual({ parts: [{ text: CAVEMAN_PROMPTS.lite }] })
    })

    it('writes to body.request.systemInstruction (Antigravity)', () => {
      const body = {
        request: {} as Record<string, unknown>,
      } as Record<string, unknown>
      injectCaveman(body, 'antigravity', 'lite')
      const req = body.request as { systemInstruction: { parts: { text: string }[] } }
      expect(req.systemInstruction.parts).toHaveLength(1)
      expect(req.systemInstruction.parts[0].text).toBe(CAVEMAN_PROMPTS.lite)
    })
  })

  describe('level variations', () => {
    it('lite includes "Respond tersely"', () => {
      const body = { messages: [{ role: 'user', content: 'hi' }] }
      injectCaveman(body, 'openai', 'lite')
      expect(body.messages[0].content as string).toContain('Respond tersely')
    })

    it('full includes "terse caveman"', () => {
      const body = { messages: [{ role: 'user', content: 'hi' }] }
      injectCaveman(body, 'openai', 'full')
      expect(body.messages[0].content as string).toContain('terse caveman')
    })

    it('ultra includes "ultra-terse"', () => {
      const body = { messages: [{ role: 'user', content: 'hi' }] }
      injectCaveman(body, 'openai', 'ultra')
      expect(body.messages[0].content as string).toContain('ultra-terse')
    })
  })

  describe('no-op cases', () => {
    it('does nothing when body is falsy', () => {
      expect(() => injectCaveman(null as unknown as Record<string, unknown>, 'openai', 'lite')).not.toThrow()
    })

    it('does nothing when level has no prompt', () => {
      const body = { messages: [{ role: 'user', content: 'hi' }] }
      const before = JSON.stringify(body)
      injectCaveman(body, 'openai', 'unknown-level' as 'lite')
      expect(JSON.stringify(body)).toBe(before)
    })
  })
})
