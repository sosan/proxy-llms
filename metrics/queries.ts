import type { AggregatedMetrics } from '../interfaces/metrics'
import type { Env } from '../interfaces/general'
import { logger } from '../utils/logger'

type AnalyticsRow = Record<string, unknown>

interface AnalyticsSqlResponse {
  data?: AnalyticsRow[]
}

export class MetricsQueries {
  private static emptyMetrics(): AggregatedMetrics {
    return {
      summary: {
        totalRequests: 0,
        streamingRequests: 0,
        nonStreamingRequests: 0,
        avgLatencyMs: 0,
        avgTtftMs: 0,
        avgTokensPerSecond: 0,
      },
      byModel: [],
      byStatus: [],
      errors: [],
    }
  }

  private static toNumber(value: unknown): number {
    return typeof value === 'number' ? value : Number(value ?? 0)
  }

  private static async query(env: Env, query: string): Promise<AnalyticsRow[]> {
    if (!env.ANALYTICS_ACCOUNT_ID || !env.ANALYTICS_API_TOKEN) {
      throw new Error('Missing Analytics Engine SQL API credentials')
    }

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.ANALYTICS_ACCOUNT_ID}/analytics_engine/sql`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.ANALYTICS_API_TOKEN}`,
        },
        body: query,
      }
    )

    if (!response.ok) {
      throw new Error(`Analytics Engine SQL API returned ${response.status}`)
    }

    const json = await response.json() as AnalyticsSqlResponse
    return json.data ?? []
  }

  /**
   * Get aggregated metrics for the last hour
   */
  static async getAggregatedMetrics(env: Env, hours: number = 1): Promise<AggregatedMetrics> {
    const safeHours = Math.max(1, Math.floor(hours))
    const timeFilter = `timestamp > NOW() - INTERVAL '${safeHours}' HOUR`

    // Query summary metrics
    const summaryQuery = `
      SELECT
        SUM(_sample_interval) AS totalRequests,
        SUM(CASE WHEN blob7 = 'stream' THEN _sample_interval ELSE 0 END) AS streamingRequests,
        SUM(CASE WHEN blob7 = 'non_stream' THEN _sample_interval ELSE 0 END) AS nonStreamingRequests,
        SUM(_sample_interval * double1) / SUM(_sample_interval) AS avgLatencyMs,
        SUM(_sample_interval * double3) / SUM(_sample_interval) AS avgTtftMs,
        SUM(_sample_interval * double5) / SUM(_sample_interval) AS avgTokensPerSecond
      FROM request_metrics
      WHERE ${timeFilter}
    `

    // Query metrics by model
    const byModelQuery = `
      SELECT
        blob2 AS model,
        SUM(_sample_interval) AS requests,
        SUM(_sample_interval * double1) / SUM(_sample_interval) AS avgLatencyMs,
        SUM(_sample_interval * double3) / SUM(_sample_interval) AS avgTtftMs,
        SUM(_sample_interval * double5) / SUM(_sample_interval) AS avgTokensPerSecond
      FROM request_metrics
      WHERE ${timeFilter}
      GROUP BY blob2
      ORDER BY requests DESC
      LIMIT 10
    `

    // Query metrics by status
    const byStatusQuery = `
      SELECT
        blob8 AS status,
        SUM(_sample_interval) AS count
      FROM request_metrics
      WHERE ${timeFilter}
      GROUP BY blob8
      ORDER BY count DESC
    `

    // Query errors
    const errorsQuery = `
      SELECT
        blob5 AS errorType,
        SUM(_sample_interval) AS count
      FROM request_metrics
      WHERE ${timeFilter}
        AND blob5 != ''
      GROUP BY blob5
      ORDER BY count DESC
    `

    try {
      const [summaryResult, byModelResult, byStatusResult, errorsResult] = await Promise.all([
        this.query(env, summaryQuery),
        this.query(env, byModelQuery),
        this.query(env, byStatusQuery),
        this.query(env, errorsQuery),
      ])

      const summaryRow = summaryResult[0] || {
        totalRequests: 0,
        streamingRequests: 0,
        nonStreamingRequests: 0,
        avgLatencyMs: 0,
        avgTtftMs: 0,
        avgTokensPerSecond: 0,
      }

      const summary = {
        totalRequests: this.toNumber(summaryRow.totalRequests),
        streamingRequests: this.toNumber(summaryRow.streamingRequests),
        nonStreamingRequests: this.toNumber(summaryRow.nonStreamingRequests),
        avgLatencyMs: this.toNumber(summaryRow.avgLatencyMs),
        avgTtftMs: this.toNumber(summaryRow.avgTtftMs),
        avgTokensPerSecond: this.toNumber(summaryRow.avgTokensPerSecond),
      }

      const byModel = byModelResult.map((row) => ({
        model: String(row.model ?? ''),
        requests: this.toNumber(row.requests),
        avgLatencyMs: this.toNumber(row.avgLatencyMs),
        avgTtftMs: this.toNumber(row.avgTtftMs),
        avgTokensPerSecond: this.toNumber(row.avgTokensPerSecond),
      }))

      const byStatus = byStatusResult.map((row) => ({
        status: this.toNumber(row.status),
        count: this.toNumber(row.count),
      }))

      const errors = errorsResult.map((row) => ({
        errorType: String(row.errorType ?? ''),
        count: this.toNumber(row.count),
      }))

      return {
        summary,
        byModel,
        byStatus,
        errors,
      }
    } catch (error) {
      logger.error('[METRICS] Failed to query Analytics Engine:', error)
      // Return empty metrics on error
      return this.emptyMetrics()
    }
  }
}
