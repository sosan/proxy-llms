import { Context } from 'hono'
import { Env } from '../interfaces/general'

/**
 * Return an empty 204 response with the Allow header.
 * Used for HEAD / OPTIONS compatibility probes.
 */
export function handleProbe(allow: string) {
  return async (_c: Context<{ Bindings: Env }>) => {
    return new Response(null, {
      status: 204,
      headers: { Allow: allow },
    })
  }
}
