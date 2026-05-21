import { handleChatCompletions } from '../controllers/chat'
import { handleClaudeMessages } from '../controllers/claude-messages'
import { handleModels } from '../controllers/models'
import { handleProcess, handleStatus, handleStream, handleWebSocket } from '../controllers/process'
import { handleHealth } from '../controllers/health'

export const registerRoutes = (app: any) => {
  app.post('/:version/chat/completions', handleChatCompletions)
  app.post('/:version/messages', handleClaudeMessages)
  app.get('/:version/models', handleModels)
  app.post('/api/process', handleProcess)
  app.get('/api/status/:processId', handleStatus)
  app.get('/api/stream/:processId', handleStream)
  app.get('/api/websocket/:processId', handleWebSocket)

  app.get('/health', handleHealth)
}
