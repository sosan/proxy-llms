import { describe, it, expect } from 'vitest'
import { resolveGatewayModel, isModelMappingError } from '../../utils/claude-model-mapping'
import type { Env } from '../../interfaces/general'

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    NVIDIA_API_KEY: 'nv',
    NVIDIA_BASE_URL: 'https://nv.test',
    ANTHROPIC_OPUS_MODEL: 'nvidia/opus-target',
    ANTHROPIC_SONNET_MODEL: 'nvidia/sonnet-target',
    ANTHROPIC_HAIKU_MODEL: 'nvidia/haiku-target',
    ANTHROPIC_DEFAULT_MODEL: 'nvidia/default-target',
    ...overrides,
  } as Env
}

describe('resolveGatewayModel', () => {
  it('maps opus to ANTHROPIC_OPUS_MODEL', () => {
    const result = resolveGatewayModel(makeEnv(), { model: 'claude-3-opus' })
    expect(isModelMappingError(result)).toBe(false)
    if (!isModelMappingError(result)) {
      expect(result.mappedModel).toBe('nvidia/opus-target')
      expect(result.updatedPayload.model).toBe('opus-target')
    }
  })

  it('maps sonnet to ANTHROPIC_SONNET_MODEL', () => {
    const result = resolveGatewayModel(makeEnv(), { model: 'claude-3-sonnet' })
    expect(isModelMappingError(result)).toBe(false)
    if (!isModelMappingError(result)) {
      expect(result.mappedModel).toBe('nvidia/sonnet-target')
      expect(result.updatedPayload.model).toBe('sonnet-target')
    }
  })

  it('maps haiku to ANTHROPIC_HAIKU_MODEL', () => {
    const result = resolveGatewayModel(makeEnv(), { model: 'claude-3-haiku' })
    expect(isModelMappingError(result)).toBe(false)
    if (!isModelMappingError(result)) {
      expect(result.mappedModel).toBe('nvidia/haiku-target')
      expect(result.updatedPayload.model).toBe('haiku-target')
    }
  })

  it('falls back to ANTHROPIC_DEFAULT_MODEL for non-tier names', () => {
    const result = resolveGatewayModel(makeEnv(), { model: 'claude-unknown' })
    expect(isModelMappingError(result)).toBe(false)
    if (!isModelMappingError(result)) {
      expect(result.mappedModel).toBe('nvidia/default-target')
    }
  })

  it('matching is case-insensitive', () => {
    const result = resolveGatewayModel(makeEnv(), { model: 'CLAUDE-3-OPUS' })
    expect(isModelMappingError(result)).toBe(false)
    if (!isModelMappingError(result)) {
      expect(result.mappedModel).toBe('nvidia/opus-target')
    }
  })

  it('returns 400 error when mapped model is empty (no env vars set)', () => {
    const env = makeEnv({
      ANTHROPIC_OPUS_MODEL: undefined,
      ANTHROPIC_SONNET_MODEL: undefined,
      ANTHROPIC_HAIKU_MODEL: undefined,
      ANTHROPIC_DEFAULT_MODEL: undefined,
    })
    const result = resolveGatewayModel(env, { model: 'claude-3-opus' })
    expect(isModelMappingError(result)).toBe(true)
    if (isModelMappingError(result)) {
      expect(result.response.status).toBe(400)
    }
  })

  it('returns 400 error when input equals mapped model (no alias change)', () => {
    const env = makeEnv({
      ANTHROPIC_OPUS_MODEL: undefined,
      ANTHROPIC_SONNET_MODEL: undefined,
      ANTHROPIC_HAIKU_MODEL: undefined,
      ANTHROPIC_DEFAULT_MODEL: undefined,
    })
    // Without env vars, resolveAnthropicModel returns input unchanged for any name
    const result = resolveGatewayModel(env, { model: 'claude-foo' })
    expect(isModelMappingError(result)).toBe(true)
    if (isModelMappingError(result)) {
      expect(result.response.status).toBe(400)
    }
  })

  it('strips provider prefix from updatedPayload.model', () => {
    const result = resolveGatewayModel(makeEnv({ ANTHROPIC_OPUS_MODEL: 'openrouter/foo/bar' }), { model: 'claude-opus' })
    expect(isModelMappingError(result)).toBe(false)
    if (!isModelMappingError(result)) {
      expect(result.mappedModel).toBe('openrouter/foo/bar')
      expect(result.updatedPayload.model).toBe('foo/bar')
    }
  })

  it('preserves other payload fields in updatedPayload', () => {
    const result = resolveGatewayModel(makeEnv(), {
      model: 'claude-3-opus',
      temperature: 0.7,
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(isModelMappingError(result)).toBe(false)
    if (!isModelMappingError(result)) {
      expect(result.updatedPayload.temperature).toBe(0.7)
      expect(result.updatedPayload.messages).toEqual([{ role: 'user', content: 'hi' }])
    }
  })
})

describe('isModelMappingError', () => {
  it('returns true for error shape', () => {
    const errResult = { error: true as const, response: new Response('{}', { status: 400 }) }
    expect(isModelMappingError(errResult)).toBe(true)
  })

  it('returns false for success shape', () => {
    const okResult = { mappedModel: 'x', updatedPayload: { model: 'x' } }
    expect(isModelMappingError(okResult)).toBe(false)
  })
})
