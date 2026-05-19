import { handleChatCompletions } from '../controllers/chat'
import { handleModels, handleProviderModels } from '../controllers/models'
import { handleOpenAIModels, handleClaudeModels } from '../controllers/legacy'
import { handleProcess, handleStatus, handleStream, handleWebSocket } from '../controllers/process'
import { handleHealth } from '../controllers/health'

export const registerRoutes = (app: any) => {
  app.post('/chat/completions', handleChatCompletions)

  app.get('/models', handleModels)
  app.get('/:provider/models', handleProviderModels)

  app.get('/openai/v1/models', handleOpenAIModels)
  app.get('/claude/v1/models', handleClaudeModels)

  app.post('/api/process', handleProcess)
  app.get('/api/status/:processId', handleStatus)
  app.get('/api/stream/:processId', handleStream)
  app.get('/api/websocket/:processId', handleWebSocket)

  app.get('/health', handleHealth)
}
