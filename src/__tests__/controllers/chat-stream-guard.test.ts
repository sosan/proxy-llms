import { describe, it, expect, vi } from 'vitest'
import { handleStreamRequest } from '../../controllers/chat'
import { ProviderError } from '../../errors/provider-error'
import { MetricsCollector } from '../../metrics/metrics-collector'

vi.mock('../../utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    logUpstreamConfig: vi.fn(),
  },
}))

vi.mock('../../metrics/metrics-collector', () => ({
  MetricsCollector: class {
    setUpstreamStatus() {}
    createStreamingTransformStream() {
      return new TransformStream()
    }
  },
}))

function fakeProvider(throwing: () => never) {
  return {
    makeStreamRequest: vi.fn().mockImplementation(throwing),
  } as any
}

describe('handleStreamRequest (network error guard)', () => {
  it('wraps a raw workerd internal error as ProviderError(502)', async () => {
    const provider = fakeProvider(() => {
      throw new Error('internal error; reference = abc123')
    })
    const metrics = new MetricsCollector({} as any, 'req1', 'm', 'nvidia', true)

    await expect(
      handleStreamRequest(provider, '/v1/chat/completions', { model: 'm' } as any, metrics),
    ).rejects.toSatisfy((err: unknown) => {
      return err instanceof ProviderError && err.status === 502 && err.code === 'upstream_network_error'
    })
  })

  it('re-throws an existing ProviderError unchanged', async () => {
    const original = new ProviderError('upstream empty stream', 502, 'upstream_empty_stream')
    const provider = fakeProvider(() => {
      throw original
    })
    const metrics = new MetricsCollector({} as any, 'req2', 'm', 'nvidia', true)

    await expect(
      handleStreamRequest(provider, '/v1/chat/completions', { model: 'm' } as any, metrics),
    ).rejects.toBe(original)
  })
})
