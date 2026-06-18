import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MetricsQueries } from '../metrics/queries'
import type { Env } from '../interfaces/general'

vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    logUpstreamConfig: vi.fn(),
  },
}))

function makeEnv(): Env {
  return {
    NVIDIA_API_KEY: 'nv',
    NVIDIA_BASE_URL: 'https://nv.test',
    ANALYTICS_ACCOUNT_ID: 'acct-123',
    ANALYTICS_API_TOKEN: 'tok-456',
    PROCESSOR: {} as any,
    DO_RATE_LIMITER: {} as any,
    ANALYTICS: { writeDataPoint: vi.fn() } as any,
  }
}

describe('MetricsQueries.getAggregatedMetrics', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns empty metrics when credentials missing (caught internally)', async () => {
    const env = makeEnv()
    delete env.ANALYTICS_ACCOUNT_ID
    const result = await MetricsQueries.getAggregatedMetrics(env)
    expect(result.summary.totalRequests).toBe(0)
    expect(result.byModel).toEqual([])
    expect(result.byStatus).toEqual([])
    expect(result.errors).toEqual([])
  })

  it('returns empty metrics when token missing (caught internally)', async () => {
    const env = makeEnv()
    delete env.ANALYTICS_API_TOKEN
    const result = await MetricsQueries.getAggregatedMetrics(env)
    expect(result.summary.totalRequests).toBe(0)
  })

  it('returns empty metrics when API returns non-2xx', async () => {
    const env = makeEnv()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('error', { status: 500 })))

    const result = await MetricsQueries.getAggregatedMetrics(env)
    expect(result.summary.totalRequests).toBe(0)
    expect(result.byModel).toEqual([])
    expect(result.byStatus).toEqual([])
    expect(result.errors).toEqual([])
  })

  it('parses summary, byModel, byStatus, and errors from API rows', async () => {
    const env = makeEnv()
    const summaryRow = {
      totalRequests: 100,
      streamingRequests: 60,
      nonStreamingRequests: 40,
      avgLatencyMs: 250.5,
      avgTtftMs: 80.2,
      avgTokensPerSecond: 42.7,
    }
    const byModelRow = {
      model: 'nvidia/test',
      requests: 50,
      avgLatencyMs: 200,
      avgTtftMs: 70,
      avgTokensPerSecond: 40,
    }
    const byStatusRow = { status: 200, count: 80 }
    const errorRow = { errorType: 'upstream_error', count: 5 }

    let callIdx = 0
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      const rows = [
        [summaryRow],
        [byModelRow],
        [byStatusRow],
        [errorRow],
      ]
      const data = rows[callIdx] ?? []
      callIdx++
      return Promise.resolve(new Response(JSON.stringify({ data }), { status: 200 }))
    }))

    const result = await MetricsQueries.getAggregatedMetrics(env)
    expect(result.summary).toEqual({
      totalRequests: 100,
      streamingRequests: 60,
      nonStreamingRequests: 40,
      avgLatencyMs: 250.5,
      avgTtftMs: 80.2,
      avgTokensPerSecond: 42.7,
    })
    expect(result.byModel).toHaveLength(1)
    expect(result.byModel[0]).toEqual({
      model: 'nvidia/test',
      requests: 50,
      avgLatencyMs: 200,
      avgTtftMs: 70,
      avgTokensPerSecond: 40,
    })
    expect(result.byStatus).toHaveLength(1)
    expect(result.byStatus[0]).toEqual({ status: 200, count: 80 })
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toEqual({ errorType: 'upstream_error', count: 5 })
  })

  it('handles string-valued numbers in API rows', async () => {
    const env = makeEnv()
    const summaryRow = {
      totalRequests: '10',
      streamingRequests: '5',
      nonStreamingRequests: '5',
      avgLatencyMs: '100.5',
      avgTtftMs: '20.1',
      avgTokensPerSecond: '15.3',
    }

    let callIdx = 0
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      // 4 queries: summary, byModel, byStatus, errors
      const data = callIdx === 0 ? [summaryRow] : []
      callIdx++
      return Promise.resolve(new Response(JSON.stringify({ data }), { status: 200 }))
    }))

    const result = await MetricsQueries.getAggregatedMetrics(env)
    expect(result.summary.totalRequests).toBe(10)
    expect(result.summary.avgLatencyMs).toBe(100.5)
    expect(result.summary.avgTtftMs).toBe(20.1)
    expect(result.summary.avgTokensPerSecond).toBe(15.3)
  })

  it('handles empty data array from API', async () => {
    const env = makeEnv()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: null }), { status: 200 }),
    ))

    const result = await MetricsQueries.getAggregatedMetrics(env)
    expect(result.summary.totalRequests).toBe(0)
    expect(result.byModel).toEqual([])
    expect(result.byStatus).toEqual([])
    expect(result.errors).toEqual([])
  })

  it('clamps hours to >= 1', async () => {
    const env = makeEnv()
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [[]] }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await MetricsQueries.getAggregatedMetrics(env, 0)
    await MetricsQueries.getAggregatedMetrics(env, -5)
    await MetricsQueries.getAggregatedMetrics(env, 2.7)

    // Every query body should reference "INTERVAL '1' HOUR" or "INTERVAL '2' HOUR"
    const bodies = fetchMock.mock.calls.map((c) => c[1]?.body as string)
    const flattened = bodies.join('\n')
    expect(flattened).toContain("INTERVAL '1' HOUR")
    expect(flattened).toContain("INTERVAL '2' HOUR")
    expect(flattened).not.toContain("INTERVAL '0' HOUR")
    expect(flattened).not.toContain("INTERVAL '-5' HOUR")
  })

  it('sends POST with bearer auth to the Cloudflare Analytics SQL endpoint', async () => {
    const env = makeEnv()
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [[]] }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await MetricsQueries.getAggregatedMetrics(env)

    expect(fetchMock).toHaveBeenCalled()
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('https://api.cloudflare.com/client/v4/accounts/acct-123/analytics_engine/sql')
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-456')
  })

  it('issues four parallel SQL queries', async () => {
    const env = makeEnv()
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [[]] }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await MetricsQueries.getAggregatedMetrics(env)

    // summary + byModel + byStatus + errors
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('catches fetch network errors and returns empty metrics', async () => {
    const env = makeEnv()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    const result = await MetricsQueries.getAggregatedMetrics(env)
    expect(result.summary.totalRequests).toBe(0)
    expect(result.byModel).toEqual([])
    expect(result.byStatus).toEqual([])
    expect(result.errors).toEqual([])
  })
})
