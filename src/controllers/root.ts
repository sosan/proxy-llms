import { Context } from 'hono'
import { Env } from '../interfaces/general'

/**
 * Root endpoint — basic proxy information.
 */
export const handleRoot = async (c: Context<{ Bindings: Env }>) => {
  return c.json({
    status: 'ok',
  })
}
