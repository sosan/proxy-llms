import { describe, it, expect, vi } from 'vitest'
import { handleCountTokens } from '../../controllers/count-tokens'

describe('handleCountTokens', () => {
  it('should return token count estimate for valid JSON body', async () => {
    const mockJson = vi.fn().mockReturnValue('mocked-response')
    const c = {
      req: { json: vi.fn().mockResolvedValue({ model: 'test', messages: [] }) },
      json: mockJson,
    } as any

    const result = await handleCountTokens(c)

    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          input_tokens: 0,
          output_tokens: 0,
        }),
      })
    )
    expect(result).toBe('mocked-response')
  })

  it('should return 400 for invalid JSON body', async () => {
    const mockJson = vi.fn().mockReturnValue('mocked-response')
    const c = {
      req: { json: vi.fn().mockRejectedValue(new Error('Invalid JSON')) },
      json: mockJson,
    } as any

    const result = await handleCountTokens(c)

    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'Invalid JSON body' }),
      expect.objectContaining({ status: 400 })
    )
    expect(result).toBe('mocked-response')
  })
})
