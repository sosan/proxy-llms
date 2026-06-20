import { describe, it, expect, vi } from 'vitest'
import { handleModels, handleProviderModels } from '../../controllers/models'

describe('handleModels', () => {
  it('should return all models from all providers with enriched metadata', async () => {
    const mockJson = vi.fn().mockReturnValue('mocked-response')
    const c = { json: mockJson } as any

    const result = await handleModels(c)

    const callArgs = mockJson.mock.calls[0][0]
    expect(callArgs.object).toBe('list')
    expect(Array.isArray(callArgs.data)).toBe(true)
    expect(callArgs.data.length).toBeGreaterThan(0)
    expect(result).toBe('mocked-response')

    const firstModel = callArgs.data[0]
    expect(firstModel).toHaveProperty('display_name')
    expect(firstModel).toHaveProperty('type', 'model')
    expect(firstModel).toHaveProperty('created_at')
  })
})

describe('handleProviderModels', () => {
  it('should return 400 when provider not specified', async () => {
    const mockJson = vi.fn().mockReturnValue('mocked-response')
    const c = {
      req: { param: vi.fn().mockReturnValue(null) },
      json: mockJson,
    } as any

    await handleProviderModels(c)

    expect(mockJson).toHaveBeenCalledWith(
      { error: 'Provider not specified in URL' },
      { status: 400 }
    )
  })

  it('should return 400 for unknown provider', async () => {
    const mockJson = vi.fn().mockReturnValue('mocked-response')
    const c = {
      req: { param: vi.fn().mockReturnValue('unknown-provider') },
      json: mockJson,
    } as any

    await handleProviderModels(c)

    const expectedMessage = expect.stringContaining('Unknown provider')
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ error: expectedMessage }),
      { status: 400 }
    )
  })

  it('should return models list for nvidia', async () => {
    const mockJson = vi.fn().mockReturnValue('mocked-response')
    const c = {
      req: { param: vi.fn().mockReturnValue('nvidia') },
      json: mockJson,
    } as any

    await handleProviderModels(c)

    const callArgs = mockJson.mock.calls[0][0]
    expect(callArgs.object).toBe('list')
    expect(Array.isArray(callArgs.data)).toBe(true)
    expect(callArgs.data.length).toBeGreaterThan(0)
  })

  it('should return models list for claude', async () => {
    const mockJson = vi.fn().mockReturnValue('mocked-response')
    const c = {
      req: { param: vi.fn().mockReturnValue('claude') },
      json: mockJson,
    } as any

    await handleProviderModels(c)

    const callArgs = mockJson.mock.calls[0][0]
    expect(callArgs.object).toBe('list')
    expect(Array.isArray(callArgs.data)).toBe(true)
  })
})
