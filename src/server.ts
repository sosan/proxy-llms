import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { Env } from './interfaces/general'
import { registerRoutes } from './routes'
import { ProcessorDurableObject } from './durable-objects/processor'
import { RateLimiterDurableObject } from './durable-objects/do-rate-limiter'
import { logger, setLoggerEnv } from './utils/logger'

// Main application assembly
const app = new Hono<{ Bindings: Env }>()

// middleware to set logger environment for each request,
// ensuring that logs have access to env vars like
// DEBUG, LOG_PAYLOAD, LOG_METRICS
app.use('*', async (c, next) => {
  setLoggerEnv(c.env)
  await next()
})

app.use('*', cors())

app.onError((err, c) => {
  const now = new Date().toUTCString()
  logger.error(`[${now}] [ERROR] Application Error: ${err}`)
  const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred'
  return c.json({ success: false, data: null, error: `Internal Server Error: ${errorMessage}` }, { status: 500 })
})

// Register all application routes
registerRoutes(app)

export default app
export { ProcessorDurableObject, RateLimiterDurableObject }
