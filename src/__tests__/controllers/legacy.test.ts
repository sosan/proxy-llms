import { describe, it, expect, vi } from 'vitest'
import { handleOpenAIModels, handleClaudeModels } from '../../controllers/legacy'

describe('handleOpenAIModels', () => {
  it('should return nvidia models list', async () => {
    const mockJson = vi.fn().mockReturnValue('mocked-response')
    const c = { json: mockJson } as any

    await handleOpenAIModels(c)

    const callArgs = mockJson.mock.calls[0][0]
    expect(callArgs.object).toBe('list')
    expect(Array.isArray(callArgs.data)).toBe(true)
    expect(callArgs.data.length).toBeGreaterThan(0)
  })
})

describe('handleClaudeModels', () => {
  it('should return claude models list', async () => {
    const mockJson = vi.fn().mockReturnValue('mocked-response')
    const c = { json: mockJson } as any

    await handleClaudeModels(c)

    const callArgs = mockJson.mock.calls[0][0]
    expect(callArgs.object).toBe('list')
    expect(Array.isArray(callArgs.data)).toBe(true)
    expect(callArgs.data.length).toBeGreaterThan(0)
  })
})
