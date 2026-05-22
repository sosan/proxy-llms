import { describe, it, expect } from 'vitest'

/**
 * Integration test for the /health endpoint.
 *
 * To run this test, set the HEALTH_CHECK_URL env variable to the deployed
 * Worker's URL (e.g. https://proxy-llms-staging.<account>.workers.dev).
 *
 *   HEALTH_CHECK_URL=https://... pnpm vitest run src/__tests__/integration/health.test.ts
 *
 * If HEALTH_CHECK_URL is not set the test is skipped so CI remains fast.
 */

describe('Integration: /health endpoint', () => {
  const healthUrl = process.env.HEALTH_CHECK_URL
    ? `${process.env.HEALTH_CHECK_URL.replace(/\/$/, '')}/health`
    : null

  it.skipIf(!healthUrl)('should return 200 and healthy status', async () => {
    const res = await fetch(healthUrl!)
    const body = (await res.json()) as { success: boolean; data: { status: string; timestamp: string; version: string } }

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toBeDefined()
    expect(body.data.status).toBe('healthy')
    expect(body.data.timestamp).toBeDefined()
    expect(body.data.version).toBe('1.0.0')
  })
})
