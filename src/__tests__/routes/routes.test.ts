import { describe, it, expect, vi } from 'vitest'
import { registerRoutes } from '../../routes/index'

describe('registerRoutes', () => {
  it('should register all expected routes with proxyToken prefix', () => {
    const app = {
      post: vi.fn().mockReturnThis(),
      get: vi.fn().mockReturnThis(),
      on: vi.fn().mockReturnThis(),
      use: vi.fn().mockReturnThis(),
    }

    registerRoutes(app)

    // Middleware registered for proxy token routes
    expect(app.use).toHaveBeenCalledWith('/:proxyToken/*', expect.any(Function))

    // POST routes
    expect(app.post).toHaveBeenCalledWith('/:proxyToken/v1/chat/completions', expect.any(Function))
    expect(app.post).toHaveBeenCalledWith('/:proxyToken/v1/messages', expect.any(Function))
    expect(app.post).toHaveBeenCalledWith('/api/process', expect.any(Function))
    expect(app.post).toHaveBeenCalledWith('/:proxyToken/v1/messages/count_tokens', expect.any(Function))
    expect(app.post).toHaveBeenCalledWith('/stop', expect.any(Function))

    // GET routes
    expect(app.get).toHaveBeenCalledWith('/:proxyToken/v1/models', expect.any(Function))
    expect(app.get).toHaveBeenCalledWith('/api/status/:processId', expect.any(Function))
    expect(app.get).toHaveBeenCalledWith('/api/stream/:processId', expect.any(Function))
    expect(app.get).toHaveBeenCalledWith('/api/websocket/:processId', expect.any(Function))
    expect(app.get).toHaveBeenCalledWith('/health', expect.any(Function))
    expect(app.get).toHaveBeenCalledWith('/', expect.any(Function))

    // HEAD / OPTIONS probes
    expect(app.on).toHaveBeenCalledWith('HEAD,OPTIONS', '/:proxyToken/v1/messages', expect.any(Function))
    expect(app.on).toHaveBeenCalledWith('HEAD,OPTIONS', '/:proxyToken/v1/messages/count_tokens', expect.any(Function))
    expect(app.on).toHaveBeenCalledWith('HEAD,OPTIONS', '/', expect.any(Function))
    expect(app.on).toHaveBeenCalledWith('HEAD,OPTIONS', '/health', expect.any(Function))

    // Verify total calls
    expect(app.post).toHaveBeenCalledTimes(5)
    expect(app.get).toHaveBeenCalledTimes(10)
    expect(app.on).toHaveBeenCalledTimes(4)
    expect(app.use).toHaveBeenCalledTimes(1)
  })

  it('should not register legacy /:version/ routes', () => {
    const app = {
      post: vi.fn().mockReturnThis(),
      get: vi.fn().mockReturnThis(),
      on: vi.fn().mockReturnThis(),
      use: vi.fn().mockReturnThis(),
    }

    registerRoutes(app)

    const postPaths = app.post.mock.calls.map((call: any[]) => call[0])
    const getPaths = app.get.mock.calls.map((call: any[]) => call[0])

    expect(postPaths).not.toContain('/:version/chat/completions')
    expect(postPaths).not.toContain('/:version/messages')
    expect(getPaths).not.toContain('/:version/models')
  })
})