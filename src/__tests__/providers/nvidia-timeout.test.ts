import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../utils/logger', () => ({
  logger: {
    withEnv: vi.fn().mockReturnValue({
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      logUpstreamConfig: vi.fn(),
    }),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    logUpstreamConfig: vi.fn(),
  },
}))

vi.mock('../../providers/base-provider', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../providers/base-provider')>()
  return {
    ...mod,
    sleep: vi.fn().mockResolvedValue(undefined),
  }
})

import { NvidiaProvider } from '../../providers/nvidia-provider'

describe('NvidiaProvider - timeout handling', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should throw ProviderError with upstream_timeout code on timeout', async () => {
    const provider = new NvidiaProvider('test-key', 'https://api.nvidia.com/v1')

    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockImplementation(() => {
      return new Promise((_resolve, reject) => {
        const error = new Error('The operation was aborted')
        error.name = 'AbortError'
        reject(error)
      })
    }) as any

    await expect(
      provider.makeRequest('/chat/completions', { model: 'test-model' }, 'openai')
    ).rejects.toMatchObject({
      code: 'upstream_timeout',
      status: 504,
    })

    globalThis.fetch = originalFetch
  })

  it('should throw ProviderError with upstream_network_error on network failure', async () => {
    const provider = new NvidiaProvider('test-key', 'https://api.nvidia.com/v1')

    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockImplementation(() => {
      return Promise.reject(new Error('ECONNREFUSED'))
    }) as any

    await expect(
      provider.makeRequest('/chat/completions', { model: 'test-model' }, 'openai')
    ).rejects.toMatchObject({
      code: 'upstream_network_error',
      status: 502,
    })

    globalThis.fetch = originalFetch
  })

  it('should throw ProviderError with upstream_timeout on stream timeout', async () => {
    const provider = new NvidiaProvider('test-key', 'https://api.nvidia.com/v1')

    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockImplementation(() => {
      return new Promise((_resolve, reject) => {
        const error = new Error('The operation was aborted')
        error.name = 'AbortError'
        reject(error)
      })
    }) as any

    await expect(
      provider.makeStreamRequest('/chat/completions', { model: 'test-model' })
    ).rejects.toMatchObject({
      code: 'upstream_timeout',
      status: 504,
    })

    globalThis.fetch = originalFetch
  })

  it('should throw ProviderError with upstream_network_error on stream network failure', async () => {
    const provider = new NvidiaProvider('test-key', 'https://api.nvidia.com/v1')

    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockImplementation(() => {
      return Promise.reject(new Error('ENOTFOUND'))
    }) as any

    await expect(
      provider.makeStreamRequest('/chat/completions', { model: 'test-model' })
    ).rejects.toMatchObject({
      code: 'upstream_network_error',
      status: 502,
    })

    globalThis.fetch = originalFetch
  })
})
