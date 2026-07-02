import { Context } from 'hono'
import type { Env } from '../interfaces/general'
import { MetricsQueries } from '../metrics/queries'
import { logger } from '../utils/logger'

/**
 * Check if the request is authorized to access metrics.
 * If METRICS_TOKEN is not set, allow all requests (local dev).
 * If METRICS_TOKEN is set, require matching X-Metrics-Token header.
 */
function checkMetricsAuth(c: Context): Response | null {
  const env = c.env as Env
  const token = env.METRICS_TOKEN

  // If no token is configured, allow all requests (local dev friendly)
  if (!token) {
    return null
  }

  // Check for the X-Metrics-Token header
  const header = c.req.header('X-Metrics-Token')
  if (header !== token) {
    return c.json({ error: 'Unauthorized' }, 403)
  }

  return null
}

/**
 * ParseEnvironment variable as number with fallback
 */
function parseNumber(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue
  const parsed = Number(value)
  return isNaN(parsed) ? defaultValue : parsed
}

/**
 * Parse window query param (e.g., "1h", "24h") into hours
 */
function parseWindow(value: string | undefined): number {
  if (!value) return 1
  const match = value.match(/^(\d+)([h|d])?$/)
  if (!match) return 1
  const num = parseInt(match[1], 10)
  const unit = match[2]
  if (unit === 'd') return num * 24
  return num
}

/**
 * Parse bucket query param (e.g., "5m", "15m", "1h")
 */
function parseBucket(value: string | undefined): number {
  if (!value) return 5
  const match = value.match(/^(\d+)([m|h])?$/)
  if (!match) return 5
  const num = parseInt(match[1], 10)
  const unit = match[2]
  if (unit === 'h') return num * 60
  return num
}

export const handleMetrics = async (c: Context) => {
  const authError = checkMetricsAuth(c)
  if (authError) return authError

  const env = c.env as Env
  const windowHours = parseWindow(c.req.query('window'))

  try {
    const metrics = await MetricsQueries.getAggregatedMetrics(env, windowHours)
    return c.json(metrics)
  } catch (error) {
    logger.error('[METRICS] Failed to get aggregated metrics:', error)
    return c.json({ error: 'Failed to query metrics' }, 500)
  }
}

export const handleMetricsTimeSeries = async (c: Context) => {
  const authError = checkMetricsAuth(c)
  if (authError) return authError

  const env = c.env as Env
  const windowHours = parseWindow(c.req.query('window'))
  const bucketMinutes = parseBucket(c.req.query('bucket'))

  try {
    const metrics = await MetricsQueries.getTimeSeriesMetrics(env, windowHours, bucketMinutes)
    return c.json(metrics)
  } catch (error) {
    logger.error('[METRICS] Failed to get time series metrics:', error)
    return c.json({ error: 'Failed to query time series' }, 500)
  }
}

export const handleMetricsProviders = async (c: Context) => {
  const authError = checkMetricsAuth(c)
  if (authError) return authError

  const env = c.env as Env
  const windowHours = parseWindow(c.req.query('window'))

  try {
    const metrics = await MetricsQueries.getProviderComparison(env, windowHours)
    return c.json(metrics)
  } catch (error) {
    logger.error('[METRICS] Failed to get provider comparison:', error)
    return c.json({ error: 'Failed to query provider comparison' }, 500)
  }
}

export const handleMetricsHealth = async (c: Context) => {
  const authError = checkMetricsAuth(c)
  if (authError) return authError

  const env = c.env as Env
  const windowHours = parseWindow(c.req.query('window'))

  try {
    const metrics = await MetricsQueries.getHealthMetrics(env, windowHours)
    return c.json(metrics)
  } catch (error) {
    logger.error('[METRICS] Failed to get health metrics:', error)
    return c.json({ error: 'Failed to query health metrics' }, 500)
  }
}
