import { handleChatCompletions } from '../controllers/chat'
import { handleClaudeMessages } from '../controllers/claude-messages.ts'
import { handleCountTokens } from '../controllers/count-tokens'
import { handleModels } from '../controllers/models'
import { handleProcess, handleStatus, handleStream, handleWebSocket } from '../controllers/process'
import { handleHealth } from '../controllers/health'
import { handleRoot } from '../controllers/root'
import { handleStop } from '../controllers/stop'
import { handleProbe } from '../controllers/probe'
import { handleMetrics, handleMetricsTimeSeries, handleMetricsProviders, handleMetricsHealth } from '../controllers/metrics'

export const registerRoutes = (app: any) => {
  // ---------------------------------------------------------------------------
  // OpenAI-compatible chat completions
  // ---------------------------------------------------------------------------
  app.post('/:version/chat/completions', handleChatCompletions)

  // ---------------------------------------------------------------------------
  // Claude-compatible messages
  // ---------------------------------------------------------------------------
  app.post('/:version/messages', handleClaudeMessages)
  app.on('HEAD,OPTIONS', '/:version/messages', handleProbe('POST, HEAD, OPTIONS'))

  // ---------------------------------------------------------------------------
  // Token counting (Claude-compatible)
  // ---------------------------------------------------------------------------
  app.post('/:version/messages/count_tokens', handleCountTokens)
  app.on('HEAD,OPTIONS', '/:version/messages/count_tokens', handleProbe('POST, HEAD, OPTIONS'))

  // ---------------------------------------------------------------------------
  // Models listing
  // ---------------------------------------------------------------------------
  app.get('/:version/models', handleModels)

  // ---------------------------------------------------------------------------
  // Durable Object async processing
  // ---------------------------------------------------------------------------
  app.post('/api/process', handleProcess)
  app.get('/api/status/:processId', handleStatus)
  app.get('/api/stream/:processId', handleStream)
  app.get('/api/websocket/:processId', handleWebSocket)

  // ---------------------------------------------------------------------------
  // Stop all pending tasks / CLI sessions
  // ---------------------------------------------------------------------------
  app.post('/stop', handleStop)

  // ---------------------------------------------------------------------------
  // Root
  // ---------------------------------------------------------------------------
  app.get('/', handleRoot)
  app.on('HEAD,OPTIONS', '/', handleProbe('GET, HEAD, OPTIONS'))

  // ---------------------------------------------------------------------------
  // Metrics
  // ---------------------------------------------------------------------------
  app.get('/metrics', handleMetrics)
  app.get('/metrics/timeseries', handleMetricsTimeSeries)
  app.get('/metrics/providers', handleMetricsProviders)
  app.get('/metrics/health', handleMetricsHealth)

  // ---------------------------------------------------------------------------
  // Health check
  // ---------------------------------------------------------------------------
  app.get('/health', handleHealth)
  app.on('HEAD,OPTIONS', '/health', handleProbe('GET, HEAD, OPTIONS'))
}
