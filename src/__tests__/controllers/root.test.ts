import { describe, it, expect, vi } from 'vitest'
import { handleRoot } from '../../controllers/root'

describe('handleRoot', () => {
  it('should return ok status', async () => {
    const mockJson = vi.fn().mockReturnValue('mocked-response')
    const c = { json: mockJson } as any

    const result = await handleRoot(c)

    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ok' })
    )
    expect(result).toBe('mocked-response')
  })
})
