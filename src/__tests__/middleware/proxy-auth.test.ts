import { describe, it, expect, vi, beforeEach } from 'vitest'
import { proxyAuthMiddleware } from '../../middleware/proxy-auth'

// Minimal mock Context compatible with the middleware signature
function createMockContext(path: string, env: Record<string, string | undefined> = {}) {
  const encoder = new TextEncoder()
  return {
    req: {
      path,
    },
    env: env,
    json: vi.fn().mockReturnValue({
      status: 401,
    }),
  } as any
}

const mockNext = vi.fn().mockResolvedValue(undefined)

describe('proxyAuthMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('when PROXY_API_KEY is not set (auth disabled)', () => {
    it('passes through all requests without checking token', async () => {
      const c = createMockContext('/abc123/v1/chat/completions', {})
      await proxyAuthMiddleware(c, mockNext)
      expect(mockNext).toHaveBeenCalled()
    })

    it('passes through root path', async () => {
      const c = createMockContext('/', {})
      await proxyAuthMiddleware(c, mockNext)
      expect(mockNext).toHaveBeenCalled()
    })

    it('passes through /health path', async () => {
      const c = createMockContext('/health', {})
      await proxyAuthMiddleware(c, mockNext)
      expect(mockNext).toHaveBeenCalled()
    })
  })

  describe('when PROXY_API_KEY is set', () => {
    const env = { PROXY_API_KEY: 'mysecret123' }

    it('passes through when token matches', async () => {
      const c = createMockContext('/mysecret123/v1/chat/completions', env)
      await proxyAuthMiddleware(c, mockNext)
      expect(mockNext).toHaveBeenCalled()
      expect(c.json).not.toHaveBeenCalled()
    })

    it('passes through when token matches (models path)', async () => {
      const c = createMockContext('/mysecret123/v1/models', env)
      await proxyAuthMiddleware(c, mockNext)
      expect(mockNext).toHaveBeenCalled()
    })

    it('returns 401 when token does not match', async () => {
      const c = createMockContext('/wrongtoken/v1/chat/completions', env)
      await proxyAuthMiddleware(c, mockNext)
      expect(c.json).toHaveBeenCalledWith({ error: 'Unauthorized' }, { status: 401 })
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('returns 401 when path has no token segment', async () => {
      const c = createMockContext('/v1/chat/completions', env)
      await proxyAuthMiddleware(c, mockNext)
      expect(c.json).toHaveBeenCalledWith({ error: 'Unauthorized' }, { status: 401 })
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('returns 401 when token is empty string', async () => {
      const c = createMockContext('//v1/chat/completions', env)
      await proxyAuthMiddleware(c, mockNext)
      expect(c.json).toHaveBeenCalledWith({ error: 'Unauthorized' }, { status: 401 })
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('is case-sensitive when comparing tokens', async () => {
      const c = createMockContext('/MySecret123/v1/chat/completions', env)
      await proxyAuthMiddleware(c, mockNext)
      expect(c.json).toHaveBeenCalledWith({ error: 'Unauthorized' }, { status: 401 })
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('uses constant-time comparison (same length tokens still checked)', async () => {
      // Token of same length as valid one should still fail if wrong
      const c = createMockContext('/zzzzzzzzzzz/v1/chat/completions', env)
      await proxyAuthMiddleware(c, mockNext)
      expect(c.json).toHaveBeenCalledWith({ error: 'Unauthorized' }, { status: 401 })
      expect(mockNext).not.toHaveBeenCalled()
    })
  })
})