import { Context } from 'hono'
import { Env } from '../interfaces/general'

/**
 * Stop all pending tasks / CLI sessions.
 *
 * NOTE: This is a placeholder implementation.  In a full
 * implementation this would signal the Durable Object or
 * another coordination layer to cancel in-flight work.
 */
export const handleStop = async (c: Context<{ Bindings: Env }>) => {
  // Placeholder: always succeed.
  return c.json({
    success: true,
    data: { status: 'stopped', cancelled_count: 0 },
    error: null,
  })
}
