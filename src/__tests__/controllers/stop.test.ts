import { describe, it, expect, vi } from 'vitest'
import { handleStop } from '../../controllers/stop'

describe('handleStop', () => {
  it('should return stopped status with zero cancelled count', async () => {
    const mockJson = vi.fn().mockReturnValue('mocked-response')
    const c = { json: mockJson } as any

    const result = await handleStop(c)

    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          status: 'stopped',
          cancelled_count: 0,
        }),
      })
    )
    expect(result).toBe('mocked-response')
  })
})
