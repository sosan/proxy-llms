import { describe, it, expect, vi } from 'vitest'
import { registerRoutes } from '../../routes/index'

describe('registerRoutes', () => {
  it('should register all expected routes', () => {
    const app = {
      post: vi.fn().mockReturnThis(),
      get: vi.fn().mockReturnThis(),
    }

    registerRoutes(app)

    // POST routes
    expect(app.post).toHaveBeenCalledWith('/:version/chat/completions', expect.any(Function))
    expect(app.post).toHaveBeenCalledWith('/:version/messages', expect.any(Function))
    expect(app.post).toHaveBeenCalledWith('/api/process', expect.any(Function))

    // GET routes
    expect(app.get).toHaveBeenCalledWith('/:version/models', expect.any(Function))
    expect(app.get).toHaveBeenCalledWith('/api/status/:processId', expect.any(Function))
    expect(app.get).toHaveBeenCalledWith('/api/stream/:processId', expect.any(Function))
    expect(app.get).toHaveBeenCalledWith('/api/websocket/:processId', expect.any(Function))
    expect(app.get).toHaveBeenCalledWith('/health', expect.any(Function))

    // Verify total calls
    expect(app.post).toHaveBeenCalledTimes(3)
    expect(app.get).toHaveBeenCalledTimes(5)
  })

  it('should not register any unexpected routes', () => {
    const app = {
      post: vi.fn().mockReturnThis(),
      get: vi.fn().mockReturnThis(),
    }

    registerRoutes(app)

    const postPaths = app.post.mock.calls.map((call: any[]) => call[0])
    const getPaths = app.get.mock.calls.map((call: any[]) => call[0])

    expect(postPaths).toContain('/:version/chat/completions')
    expect(postPaths).toContain('/api/process')
    expect(getPaths).toContain('/:version/models')
    expect(getPaths).toContain('/api/status/:processId')
    expect(getPaths).toContain('/health')
  })
})
