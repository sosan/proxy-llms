import { Hono } from 'hono'
import { cors } from 'hono/cors'

// =============================================================================
// STRUCTURED PROMPT-DRIVEN DEVELOPMENT PATTERN
// =============================================================================
// Architecture: Multi-Provider AI Proxy with Async Processing
// Contract: RESTful API with standardized error handling and response formats
// Pattern: Event-driven processing with Durable Objects for state management

/**
 * SYSTEM CONTRACTS & INTERFACES
 */

// Standard API Response Contract
const createResponse = (success, data, error = null) => ({
  success,
  data,
  error,
  timestamp: new Date().toISOString()
})

// Process State Contract
const ProcessStates = {
  PENDING: 'pending',
  PROCESSING: 'processing', 
  COMPLETED: 'completed',
  FAILED: 'failed'
}

// Provider Configuration Contract
const ProviderConfigs = {
  deepseek: {
    endpoint: '/deepseek/v1/chat/completions',
    model: 'deepseek-ai/deepseek-v4-pro',
    format: 'openai'
  },
  claude: {
    endpoint: '/claude/v1/messages',
    model: 'anthropic/claude-3-5-sonnet-20240620',
    format: 'anthropic'
  },
  openai: {
    endpoint: '/openai/v1/chat/completions', 
    model: 'openai/gpt-oss-120b',
    format: 'openai'
  },
  zai: {
    endpoint: '/zai/v1/chat/completions',
    model: 'z-ai/glm4.7',
    format: 'openai'
  }
}

/**
 * CORE BUSINESS LOGIC MODULES
 */

// Rate Limiting Contract
class RateLimiter {
  constructor(maxRequests = 40, windowMs = 60000) {
    this.maxRequests = maxRequests
    this.windowMs = windowMs
    this.requests = new Map()
  }

  isAllowed(clientId) {
    const now = Date.now()
    const windowStart = now - this.windowMs
    
    if (!this.requests.has(clientId)) {
      this.requests.set(clientId, [])
    }
    
    const clientRequests = this.requests.get(clientId)
    const validRequests = clientRequests.filter(time => time > windowStart)
    
    if (validRequests.length >= this.maxRequests) {
      return false
    }
    
    validRequests.push(now)
    this.requests.set(clientId, validRequests)
    return true
  }
}

// NVIDIA NIM Provider Contract
class NIMProvider {
  constructor(apiKey, baseUrl) {
    this.apiKey = apiKey
    this.baseUrl = baseUrl
  }

  async makeRequest(endpoint, payload, format = 'openai') {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        throw new Error(`NIM API Error: ${response.status} ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      throw new Error(`NIM Provider Error: ${error.message}`)
    }
  }

  // Transform requests to match NIM expectations
  transformRequest(payload, config) {
    if (config.format === 'anthropic') {
      // Convert Anthropic format to OpenAI format for NIM
      return {
        model: config.model,
        messages: payload.messages || [{ role: 'user', content: payload.content || '' }],
        max_tokens: payload.max_tokens || 2048,
        temperature: payload.temperature || 0.7
      }
    }
    
    // Handle z.ai specific parameters
    if (config.model === 'z-ai/glm4.7') {
      return {
        model: config.model,
        messages: payload.messages,
        temperature: payload.temperature || 1,
        top_p: payload.top_p || 1,
        max_tokens: payload.max_tokens || 32768,
        chat_template_kwargs: payload.chat_template_kwargs || {
          enable_thinking: true,
          clear_thinking: false
        },
        stream: payload.stream || false
      }
    }
    
    return {
      model: config.model,
      ...payload
    }
  }
}

// Async Processor Contract (Durable Object)
export class ProcessorDurableObject {
  constructor(state, env) {
    this.state = state
    this.env = env
    this.nimProvider = new NIMProvider(env.NVIDIA_API_KEY, env.NVIDIA_BASE_URL)
    this.websockets = new Set()
  }

  async fetch(request) {
    const url = new URL(request.url)
    const path = url.pathname

    switch (path) {
      case '/start':
        return await this.startProcess(request)
      case '/status':
        return await this.getStatus()
      case '/websocket':
        return await this.handleWebSocket(request)
      default:
        return new Response('Not Found', { status: 404 })
    }
  }

  async startProcess(request) {
    try {
      const data = await request.json()
      
      // Initialize process state
      await this.state.storage.put('processState', {
        status: ProcessStates.PENDING,
        data: data,
        startTime: Date.now(),
        progress: 0
      })

      // Start async processing (don't await)
      this.processAsync(data)

      return Response.json(createResponse(true, { 
        status: ProcessStates.PENDING,
        message: 'Process started'
      }))

    } catch (error) {
      return Response.json(createResponse(false, null, error.message), { status: 500 })
    }
  }

  async processAsync(data) {
    try {
      // Update to processing state
      await this.updateProgress(ProcessStates.PROCESSING, 10)

      // Simulate complex processing with progress updates
      for (let i = 20; i <= 80; i += 20) {
        await new Promise(resolve => setTimeout(resolve, 1000))
        await this.updateProgress(ProcessStates.PROCESSING, i)
      }

      // Make actual AI request
      const config = ProviderConfigs[data.provider] || ProviderConfigs.openai
      const transformedPayload = this.nimProvider.transformRequest(data.payload, config)
      
      const result = await this.nimProvider.makeRequest(config.endpoint, transformedPayload, config.format)

      // Complete with results
      await this.state.storage.put('processState', {
        status: ProcessStates.COMPLETED,
        data: data,
        result: result,
        progress: 100,
        completedAt: Date.now()
      })

      this.broadcastUpdate({ 
        status: ProcessStates.COMPLETED, 
        progress: 100, 
        result 
      })

    } catch (error) {
      await this.state.storage.put('processState', {
        status: ProcessStates.FAILED,
        data: data,
        error: error.message,
        progress: 0,
        failedAt: Date.now()
      })

      this.broadcastUpdate({ 
        status: ProcessStates.FAILED, 
        error: error.message 
      })
    }
  }

  async updateProgress(status, progress) {
    const currentState = await this.state.storage.get('processState')
    const updatedState = { ...currentState, status, progress }
    await this.state.storage.put('processState', updatedState)
    
    this.broadcastUpdate({ status, progress })
  }

  async getStatus() {
    const processState = await this.state.storage.get('processState')
    return Response.json(createResponse(true, processState || { status: 'not_found' }))
  }

  async handleWebSocket(request) {
    if (request.headers.get('Upgrade') === 'websocket') {
      const [client, server] = Object.values(new WebSocketPair())
      
      this.websockets.add(server)
      
      server.addEventListener('close', () => {
        this.websockets.delete(server)
      })

      return new Response(null, { status: 101, webSocket: client })
    }
    
    return new Response('Expected WebSocket', { status: 400 })
  }

  broadcastUpdate(update) {
    const message = JSON.stringify(update)
    for (const ws of this.websockets) {
      try {
        ws.send(message)
      } catch (error) {
        this.websockets.delete(ws)
      }
    }
  }
}

/**
 * MAIN APPLICATION ASSEMBLY
 */

const app = new Hono()
const rateLimiter = new RateLimiter()

// Middleware Pipeline
app.use('*', cors())
app.use('*', async (c, next) => {
  const clientId = c.req.header('CF-Connecting-IP') || 'anonymous'
  
  if (!rateLimiter.isAllowed(clientId)) {
    return c.json(createResponse(false, null, 'Rate limit exceeded'), 429)
  }
  
  await next()
})

// Error Handler Middleware
app.onError((err, c) => {
  console.error('Application Error:', err)
  return c.json(createResponse(false, null, 'Internal Server Error'), 500)
})

/**
 * ROUTE DEFINITIONS - SYNCHRONOUS PROVIDERS
 */

// Provider route factory
const createProviderRoute = (providerName) => {
  return async (c) => {
    try {
      const config = ProviderConfigs[providerName]
      const payload = await c.req.json()
      
      const nimProvider = new NIMProvider(
        c.env.NVIDIA_API_KEY, 
        c.env.NVIDIA_BASE_URL
      )
      
      const transformedPayload = nimProvider.transformRequest(payload, config)
      const result = await nimProvider.makeRequest(config.endpoint, transformedPayload, config.format)
      
      return c.json(createResponse(true, result))
      
    } catch (error) {
      console.error(`${providerName} Provider Error:`, error)
      return c.json(createResponse(false, null, error.message), 500)
    }
  }
}

// Register provider routes
app.post('/deepseek/v1/chat/completions', createProviderRoute('deepseek'))
app.post('/claude/v1/messages', createProviderRoute('claude'))
app.post('/openai/v1/chat/completions', createProviderRoute('openai'))
app.post('/zai/v1/chat/completions', createProviderRoute('zai'))

/**
 * ROUTE DEFINITIONS - ASYNCHRONOUS PROCESSING
 */

app.post('/api/process', async (c) => {
  try {
    const data = await c.req.json()
    const processId = crypto.randomUUID()
    
    // Create Durable Object instance
    const durableObjectId = c.env.PROCESSOR.idFromName(processId)
    const durableObject = c.env.PROCESSOR.get(durableObjectId)
    
    // Start async processing
    await durableObject.fetch('https://internal/start', {
      method: 'POST',
      body: JSON.stringify(data)
    })
    
    const baseUrl = new URL(c.req.url).origin
    
    return c.json(createResponse(true, {
      processId,
      statusUrl: `${baseUrl}/api/status/${processId}`,
      streamUrl: `${baseUrl}/api/stream/${processId}`,
      websocketUrl: `${baseUrl}/api/websocket/${processId}`
    }))
    
  } catch (error) {
    console.error('Process Start Error:', error)
    return c.json(createResponse(false, null, error.message), 500)
  }
})

app.get('/api/status/:processId', async (c) => {
  try {
    const processId = c.req.param('processId')
    const durableObjectId = c.env.PROCESSOR.idFromName(processId)
    const durableObject = c.env.PROCESSOR.get(durableObjectId)
    
    const response = await durableObject.fetch('https://internal/status')
    const data = await response.json()
    
    return c.json(data)
    
  } catch (error) {
    console.error('Status Check Error:', error)
    return c.json(createResponse(false, null, error.message), 500)
  }
})

app.get('/api/stream/:processId', async (c) => {
  try {
    const processId = c.req.param('processId')
    
    return new Response(
      new ReadableStream({
        start(controller) {
          // SSE implementation would go here
          controller.enqueue(`data: ${JSON.stringify({ status: 'connected' })}\n\n`)
        }
      }),
      {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      }
    )
    
  } catch (error) {
    console.error('Stream Error:', error)
    return c.json(createResponse(false, null, error.message), 500)
  }
})

app.get('/api/websocket/:processId', async (c) => {
  try {
    const processId = c.req.param('processId')
    const durableObjectId = c.env.PROCESSOR.idFromName(processId)
    const durableObject = c.env.PROCESSOR.get(durableObjectId)
    
    return await durableObject.fetch('https://internal/websocket', {
      headers: { 'Upgrade': 'websocket' }
    })
    
  } catch (error) {
    console.error('WebSocket Error:', error)
    return new Response('WebSocket Error', { status: 500 })
  }
})

// Health check endpoint
app.get('/health', (c) => {
  return c.json(createResponse(true, { 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  }))
})

export default app