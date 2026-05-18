import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleProcess, handleStatus, handleStream, handleWebSocket } from '../../controllers/process'

const createMockDurableObject = (responseData?: any) => ({
  fetch: vi.fn().mockImplementation((req: Request) => {
    if (responseData !== undefined) {
      return Promise.resolve(new Response(JSON.stringify(responseData)))
    }
    return Promise.resolve(new Response(JSON.stringify({ success: true })))
  }),
})

const createMockContext = (overrides: any = {}) => {
  const defaultDurableObject = createMockDurableObject(overrides.durableResponse)

  return {
    req: {
      url: 'https://test.example.com/api/process',
      param: vi.fn().mockImplementation((name: string) => {
        if (name === 'processId') return overrides.param ?? 'test-process-id'
        if (name === 'provider') return 'nvidia'
        return undefined
      }),
      json: vi.fn().mockResolvedValue(overrides.body ?? { provider: 'nvidia', model: 'test' }),
      ...overrides.req,
    },
    env: {
      PROCESSOR: {
        idFromName: vi.fn().mockReturnValue('durable-object-id'),
        get: vi.fn().mockReturnValue(overrides.durableObject ?? defaultDurableObject),
      },
      ...overrides.env,
    },
    json: vi.fn().mockReturnValue('mocked-response'),
    ...overrides,
  }
}

describe('handleProcess', () => {
  it('should start a process and return process info with URLs', async () => {
    const c = createMockContext()

    await handleProcess(c as any)

    expect(c.env.PROCESSOR.idFromName).toHaveBeenCalled()
    expect(c.env.PROCESSOR.get).toHaveBeenCalledWith('durable-object-id')
    expect(c.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          processId: expect.any(String),
          statusUrl: expect.stringContaining('/api/status/'),
          streamUrl: expect.stringContaining('/api/stream/'),
          websocketUrl: expect.stringContaining('/api/websocket/'),
        }),
      })
    )
  })

  it('should return error for invalid request body', async () => {
    const c = createMockContext({ body: null })

    // Override req.json to return null to simulate empty body
    c.req.json = vi.fn().mockResolvedValue(null)

    await handleProcess(c as any)

    // When body is null, parseRequestBody should return an error
    expect(c.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.any(String) }),
      expect.any(Object)
    )
  })

  it('should handle Durable Object errors gracefully', async () => {
    const failingDurableObject = {
      fetch: vi.fn().mockRejectedValue(new Error('Durable Object failed')),
    }
    const c = createMockContext({ durableObject: failingDurableObject })

    await handleProcess(c as any)

    expect(c.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('Failed to start process'),
      }),
      { status: 500 }
    )
  })
})

describe('handleStatus', () => {
  it('should return 400 when processId not specified', async () => {
    const c = createMockContext({ param: null })
    c.req.param = vi.fn().mockReturnValue(null)

    await handleStatus(c as any)

    expect(c.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'Process ID not specified in URL' }),
      { status: 400 }
    )
  })

  it('should fetch status from Durable Object', async () => {
    const statusData = {
      success: true,
      data: { status: 'running', progress: 50, result: null, error: null },
    }
    const durableObject = createMockDurableObject(statusData)
    const c = createMockContext({ durableObject, param: 'test-id' })

    await handleStatus(c as any)

    expect(c.env.PROCESSOR.idFromName).toHaveBeenCalledWith('test-id')
    expect(durableObject.fetch).toHaveBeenCalledWith('https://internal/status')
    expect(c.json).toHaveBeenCalledWith(statusData)
  })

  it('should handle Durable Object errors gracefully', async () => {
    const failingDurableObject = {
      fetch: vi.fn().mockRejectedValue(new Error('Connection failed')),
    }
    const c = createMockContext({ durableObject: failingDurableObject, param: 'test-id' })

    await handleStatus(c as any)

    expect(c.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('Error checking status'),
      }),
      { status: 500 }
    )
  })
})

describe('handleStream', () => {
  it('should return a Response with SSE headers when processId is provided', async () => {
    const statusData = {
      success: true,
      data: { status: 'running', progress: 50, result: null, error: null },
    }
    const durableObject = createMockDurableObject(statusData)
    const c = createMockContext({ durableObject, param: 'test-id' })

    const response = await handleStream(c as any)

    expect(response).toBeDefined()
    expect(response.headers.get('Content-Type')).toBe('text/event-stream')
    expect(response.headers.get('Cache-Control')).toBe('no-cache')
    expect(response.headers.get('Connection')).toBe('keep-alive')
  })

  it('should return a Response even when Durable Object errors', async () => {
    const failingDurableObject = {
      fetch: vi.fn().mockRejectedValue(new Error('Stream failed')),
    }
    const c = createMockContext({ durableObject: failingDurableObject, param: 'test-id' })

    const response = await handleStream(c as any)

    // When DO fails inside the ReadableStream, the error is not caught by the outer try/catch
    // The Response is still returned with SSE headers
    expect(response).toBeDefined()
    expect(response.headers.get('Content-Type')).toBe('text/event-stream')
  })
})

describe('handleWebSocket', () => {
  it('should return 400 when processId not specified', async () => {
    const c = createMockContext({ param: null })
    c.req.param = vi.fn().mockReturnValue(null)

    await handleWebSocket(c as any)

    expect(c.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'Process ID not specified in URL' }),
      { status: 400 }
    )
  })

  it('should fetch WebSocket upgrade from Durable Object', async () => {
    const wsResponse = new Response('websocket upgrade', { status: 200 })
    const durableObject = {
      fetch: vi.fn().mockResolvedValue(wsResponse),
    }
    const c = createMockContext({ durableObject, param: 'test-id' })

    const result = await handleWebSocket(c as any)

    expect(c.env.PROCESSOR.idFromName).toHaveBeenCalledWith('test-id')
    expect(durableObject.fetch).toHaveBeenCalled()
    expect(result).toBe(wsResponse)
  })

  it('should handle Durable Object errors gracefully', async () => {
    const failingDurableObject = {
      fetch: vi.fn().mockRejectedValue(new Error('WebSocket failed')),
    }
    const c = createMockContext({ durableObject: failingDurableObject, param: 'test-id' })

    const result = await handleWebSocket(c as any)

    expect(result.status).toBe(500)
    expect(await result.text()).toContain('WebSocket Connection Error')
  })
})
