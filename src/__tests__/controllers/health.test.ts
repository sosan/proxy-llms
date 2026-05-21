import { describe, it, expect, vi } from 'vitest'
import { handleHealth } from '../../controllers/health'

describe('handleHealth', () => {
  it('should return healthy status', async () => {
    const mockJson = vi.fn().mockReturnValue('mocked-response')
    const c = { json: mockJson } as any

    const result = handleHealth(c)

    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          status: 'healthy',
          version: '1.0.0',
        }),
      })
    )
    expect(result).toBe('mocked-response')
  })

  it('should include timestamp in response', async () => {
    const mockJson = vi.fn().mockReturnValue('mocked-response')
    const c = { json: mockJson } as any

    handleHealth(c)

    const callArgs = mockJson.mock.calls[0][0]
    expect(callArgs.data.timestamp).toBeDefined()
    expect(new Date(callArgs.data.timestamp).getTime()).not.toBeNaN()
  })
})
