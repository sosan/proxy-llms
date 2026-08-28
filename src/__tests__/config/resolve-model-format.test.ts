import { describe, it, expect } from 'vitest'
import { resolveModelFormat } from '../../config/providers'

describe('resolveModelFormat', () => {
  it('should return model-specific format when defined in ModelDefaultsById', () => {
    expect(resolveModelFormat('nvidia/moonshotai/kimi-k3')).toBe('openai')
  })

  it('should fallback to provider default format when no model-specific format', () => {
    expect(resolveModelFormat('nvidia/z-ai/glm-5.1')).toBe('openai')
  })

  it('should fallback to provider default format for unknown models', () => {
    expect(resolveModelFormat('openrouter/unknown-model')).toBe('openai')
  })

  it('should return openai format for NVIDIA models', () => {
    expect(resolveModelFormat('nvidia/deepseek/deepseek-v4-pro')).toBe('openai')
  })

  it('should return anthropic format for claude provider', () => {
    expect(resolveModelFormat('anthropic/claude/claude-opus-4-7')).toBe('anthropic')
  })

  it('should return openai format for openrouter hy3', () => {
    expect(resolveModelFormat('openrouter/tencent/hy3:free')).toBe('openai')
  })

  it('should return openai format for openrouter gpt-oss', () => {
    expect(resolveModelFormat('openrouter/openai/gpt-oss-120b:free')).toBe('openai')
  })
})
