import { describe, it, expect, vi } from 'vitest'
import { handleModels, handleProviderModels } from '../../controllers/models'

describe('handleModels', () => {
  it('should return notcreated placeholder', async () => {
    const mockJson = vi.fn().mockReturnValue('mocked-response')
    const c = { json: mockJson } as any

    const result = await handleModels(c)

    expect(mockJson).toHaveBeenCalledWith({ notcreated: 'notcreated' })
    expect(result).toBe('mocked-response')
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
      expect.objectContaining({ success: false, error: 'Provider not specified in URL' }),
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
      expect.objectContaining({ success: false, error: expectedMessage }),
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
