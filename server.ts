import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { Env } from './interfaces/general'
import { registerRoutes } from './routes'

// Main application assembly
const app = new Hono<{ Bindings: Env }>()

app.use('*', cors())

app.onError((err, c) => {
  console.error('Application Error:', err)
  const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred'
  return c.json({ success: false, data: null, error: `Internal Server Error: ${errorMessage}` }, { status: 500 })
})

// Register all application routes
registerRoutes(app)

export default app
