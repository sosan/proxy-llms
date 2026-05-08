import { Hono, Context, HonoRequest } from 'hono'
import { cors } from 'hono/cors'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { Env, ApiResponse, MessageContentPart, ChatMessage, GenericPayload, ProcessState, ProviderConfig } from './interfaces/general'
import { createModelsList, ModelDefaultsById, ProviderConfigs, resolveModel } from './config/providers'
import { ProviderError } from './errors/provider-error'

// Process States Contract
const ProcessStates = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed'
} as const

const DEFAULT_MAX_TOKENS = 32768
const DEFAULT_MAX_TEMP = 1
const DEFAULT_MAX_TOP_P = 1
const DEFAULT_IS_STREAMING = false
const NVIDIA_RATE_LIMIT_KEY = 'nvidia-upstream'
const ROUTING_PAYLOAD_KEYS = new Set(['provider', 'model', 'messages', 'content'])

// =============================================================================
// STRUCTURED PROMPT-DRIVEN DEVELOPMENT PATTERN
// =============================================================================

// Standard API Response Contract
const createResponse = <T>(success: boolean, data: T | null, error: string | null = null): ApiResponse<T> => ({
  success,
  data,
  error,
  timestamp: new Date().toISOString()
})

// --- Adapted for Durable Objects ---
// This function takes a Request object and returns a parsed payload or an error.
// Modified to accept HonoRequest as well, by using request.json() which is available on both.
const parseRequestBody = async (request: Request | HonoRequest): Promise<{ payload: GenericPayload; error?: undefined; status?: undefined } | { error: string; status: ContentfulStatusCode; payload?: undefined }> => {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return { error: 'Invalid or missing request body: expected valid JSON', status: 400 as ContentfulStatusCode }
  }

  if (!payload || payload == null) {
    return { error: 'Request body must be a non-null JSON object', status: 400 as ContentfulStatusCode }
  }

  const genericPayload = payload as GenericPayload;
  if (!genericPayload.messages && !genericPayload.content && !genericPayload.provider) {
    // This check might be too strict depending on all use cases.
    // For now, it's a hint that something might be missing if it's not a simple API call.
  }

  return { payload: genericPayload }
}
/**
 * CORE BUSINESS LOGIC MODULES
 */

class RateLimiter {
  private maxRequests: number
  private windowMs: number
  private requests: Map<string, number[]>

  constructor(maxRequests = 40, windowMs = 60000) {
    this.maxRequests = maxRequests
    this.windowMs = windowMs
    this.requests = new Map()
  }

  isAllowed(clientId: string): boolean {
    const now = Date.now()
    const windowStart = now - this.windowMs

    if (!this.requests.has(clientId)) {
      this.requests.set(clientId, [])
    }

    const clientRequests = this.requests.get(clientId)!
    const validRequests = clientRequests.filter(time => time > windowStart)

    if (validRequests.length >= this.maxRequests) {
      return false
    }

    validRequests.push(now)
    this.requests.set(clientId, validRequests)
    return true
  }
}

class NIMProvider {
  private apiKey: string
  private baseUrl: string
  private readonly responseTimeoutMs = 980_000

  constructor(apiKey: string, baseUrl: string) {
    this.apiKey = apiKey
    this.baseUrl = baseUrl
  }

  private async readErrorBody(response: Response): Promise<unknown> {
    const text = await response.text().catch(() => '')
    if (!text) return '<empty>'

    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  }

  private createAbortTimeout(requestId: string): { signal: AbortSignal; clear: () => void } {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      console.warn(`[${requestId}] ⚠ Timeout propio alcanzado — abortando request`)
      controller.abort()
    }, this.responseTimeoutMs)

    return {
      signal: controller.signal,
      clear: () => clearTimeout(timeoutId),
    }
  }

  private logUpstreamConfig(requestId: string, payload: unknown): void {
    const payloadRecord = payload as Record<string, unknown>
    const { messages: _messages, ...safePayload } = payloadRecord

    console.log(`[${requestId}] → NVIDIA config`, {
      ...safePayload,
      messages_count: Array.isArray(payloadRecord.messages) ? payloadRecord.messages.length : 0,
    })
  }

  private createUpstreamError(response: Response, errorBody: unknown): ProviderError {
    const retryAfter = response.headers.get('retry-after') ?? undefined

    if (response.status === 429) {
      const retryHint = retryAfter ? ` Retry after ${retryAfter} seconds.` : ''

      return new ProviderError(
        `NVIDIA API rate limited the request: ${JSON.stringify(errorBody)}`,
        429 as ContentfulStatusCode,
        'upstream_rate_limited',
        `NVIDIA rate limit reached. Wait a bit before retrying or switch to another model.${retryHint}`,
        retryAfter
      )
    }

    return new ProviderError(
      `NVIDIA API returned ${response.status}: ${JSON.stringify(errorBody)}`,
      response.status as ContentfulStatusCode,
      'upstream_error',
      `NVIDIA returned error ${response.status}.`,
      retryAfter
    )
  }

  async makeStreamRequest(endpoint: string, payload: unknown): Promise<Response> {
    const requestId = crypto.randomUUID().slice(0, 8)
    const uri = `${this.baseUrl}${endpoint}`
    const timeout = this.createAbortTimeout(requestId)

    console.log(`[${requestId}] → Stream request`, {
      uri,
      model: (payload as Record<string, unknown>).model,
    })
    this.logUpstreamConfig(requestId, payload)

    let response: Response
    try {
      response = await fetch(uri, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: timeout.signal,
      })
    } catch (err) {
      timeout.clear()
      if (err instanceof Error && err.name === 'AbortError') {
        console.error(`[${requestId}] ✘ Timeout — NVIDIA did not respond in time`)
        throw new ProviderError(
          'NVIDIA did not send a response before the proxy timeout',
          504 as ContentfulStatusCode,
          'upstream_timeout',
          'NVIDIA took too long to respond. Retry the request or try a faster model.'
        )
      }
      console.error(`[${requestId}] ✘ Error de red`, { error: err instanceof Error ? err.message : err })
      throw new ProviderError(
        `Network error while contacting NVIDIA: ${err instanceof Error ? err.message : 'unknown'}`,
        502 as ContentfulStatusCode,
        'upstream_network_error',
        'Could not connect to NVIDIA. Retry the request in a few seconds.'
      )
    }

    timeout.clear()

    console.log(`[${requestId}] ← Respuesta upstream`, {
      status: response.status,
      contentType: response.headers.get('content-type'),
    })

    if (!response.ok) {
      const errorBody = await this.readErrorBody(response)
      console.error(`[${requestId}] ✘ Upstream error`, {
        status: response.status,
        retryAfter: response.headers.get('retry-after'),
        body: errorBody,
      })
      throw this.createUpstreamError(response, errorBody)
    }

    return response
  }

  // Bufferiza la respuesta completa y la devuelve como objeto
  async makeRequest(
    endpoint: string,
    payload: unknown,
    _configFormat: string,
    onChunk?: (chunk: unknown) => void
  ): Promise<unknown> {
    const requestId = crypto.randomUUID().slice(0, 8)
    const uri = `${this.baseUrl}${endpoint}`
    const timeout = this.createAbortTimeout(requestId)

    console.log(`[${requestId}] → Request`, {
      uri,
      model: (payload as Record<string, unknown>).model,
      messages: ((payload as Record<string, unknown>).messages as unknown[])?.length ?? 0,
    })
    this.logUpstreamConfig(requestId, payload)

    let response: Response
    try {
      response = await fetch(uri, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: timeout.signal,
      })
    } catch (err) {
      timeout.clear()
      if (err instanceof Error && err.name === 'AbortError') {
        console.error(`[${requestId}] ✘ Timeout — NVIDIA did not respond in time`)
        throw new ProviderError(
          'NVIDIA did not send a response before the proxy timeout',
          504 as ContentfulStatusCode,
          'upstream_timeout',
          'NVIDIA took too long to respond. Retry the request or try a faster model.'
        )
      }
      console.error(`[${requestId}] ✘ Error de red`, { error: err instanceof Error ? err.message : err })
      throw new ProviderError(
        `Network error while contacting NVIDIA: ${err instanceof Error ? err.message : 'unknown'}`,
        502 as ContentfulStatusCode,
        'upstream_network_error',
        'Could not connect to NVIDIA. Retry the request in a few seconds.'
      )
    }

    timeout.clear()

    console.log(`[${requestId}] ← Respuesta recibida`, {
      status: response.status,
      contentType: response.headers.get('content-type'),
    })

    if (!response.ok) {
      const errorBody = await this.readErrorBody(response)
      console.error(`[${requestId}] ✘ Error del servidor`, {
        status: response.status,
        retryAfter: response.headers.get('retry-after'),
        body: errorBody,
      })
      throw this.createUpstreamError(response, errorBody)
    }

    const json = await response.json()
    console.log(`[${requestId}] ✔ Completada`, {
      finish_reason: ((json as Record<string, unknown>).choices as Array<{ finish_reason?: string }>)?.[0]?.finish_reason,
    })
    return json
  }


  // Modified to accept GenericPayload and transform it for specific providers
  transformRequest(payload: GenericPayload, config: ProviderConfig): unknown {
    const model = resolveModel(config, payload.model); // Use the resolved model
    const modelDefaults = ModelDefaultsById[model] ?? {}

    // Prepare messages, checking for both 'messages' array and 'content' string/array
    let messages: ChatMessage[] = [];
    if (payload.messages && Array.isArray(payload.messages)) {
      messages = payload.messages as ChatMessage[];
    } else if (typeof payload.content === 'string') {
      // If only content is provided as a string, create a single user message
      messages.push({ role: 'user', content: payload.content });
    } else if (payload.content && Array.isArray(payload.content)) {
      // If content is an array of MessageContentPart
      messages.push({ role: 'user', content: payload.content as MessageContentPart[] });
    }

    // If no messages were formed and provider is specified, try to default to a simple user message
    // This fallback might need adjustment based on specific API requirements.
    if (messages.length === 0 && payload.provider) {
      messages.push({ role: 'user', content: `Default message for ${payload.provider} provider.` });
    }

    // General payload structure, adaptable for different providers
    const commonPayload: Record<string, unknown> = {
      ...modelDefaults.extra,
      model: model, // Use the resolved model ID
      messages: messages,
      temperature: payload.temperature ?? modelDefaults.temperature ?? DEFAULT_MAX_TEMP,
      top_p: payload.top_p ?? modelDefaults.top_p ?? DEFAULT_MAX_TOP_P,
      max_tokens: payload.max_tokens ?? modelDefaults.max_tokens ?? DEFAULT_MAX_TOKENS,
      stream: payload.stream ?? modelDefaults.stream ?? DEFAULT_IS_STREAMING,
    };

    // Forward OpenAI/NVIDIA-compatible params such as tools, tool_choice,
    // response_format, stop, seed, penalties, stream_options, or chat_template_kwargs.
    for (const [key, value] of Object.entries(payload)) {
      if (ROUTING_PAYLOAD_KEYS.has(key) || value === undefined) continue
      commonPayload[key] = value
    }

    return commonPayload;
  }
}

// Module-level singleton — initialized lazily on first request
let nimProvider: NIMProvider | null = null

const getNIMProvider = (env: Env): NIMProvider => {
  if (!nimProvider) {
    nimProvider = new NIMProvider(env.NVIDIA_API_KEY, env.NVIDIA_BASE_URL)
  }
  return nimProvider
}

// Async Processor Contract (Durable Object)
export class ProcessorDurableObject {
  private state: DurableObjectState
  private env: Env
  private nimProvider: NIMProvider
  private websockets: Set<WebSocket>

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
    this.nimProvider = new NIMProvider(env.NVIDIA_API_KEY, env.NVIDIA_BASE_URL)
    this.websockets = new Set()
  }

  async fetch(request: Request): Promise<Response> {
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

  private async startProcess(request: Request): Promise<Response> {
    try {
      const result = await parseRequestBody(request)
      if (result.error) {
        return Response.json(createResponse(false, null, result.error), { status: result.status })
      }
      const data = result.payload;
      if (!data) {
        return Response.json(createResponse(false, null, result.error), { status: result.status })
      }

      // Ensure model is defined or default it if not specified
      if (!data.model && !data.provider) {
        data.model = 'openai/gpt-4o'; // Default model
      } else if (data.model && !data.provider) {
        let inferredProvider = 'openai'; // Default provider
        for (const pName in ProviderConfigs) {
          if (ProviderConfigs[pName].models[data.model] || Object.values(ProviderConfigs[pName].models).includes(data.model)) {
            inferredProvider = pName;
            break;
          }
        }
        data.provider = inferredProvider;
      }

      await this.state.storage.put('processState', {
        status: ProcessStates.PENDING,
        data: data,
        startTime: Date.now(),
        progress: 0
      } satisfies ProcessState)

      this.processAsync(data) // Pass the processed data

      return Response.json(createResponse(true, {
        status: ProcessStates.PENDING,
        message: 'Process started'
      }))

    } catch (error) {
      console.error('Start Process Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      return Response.json(createResponse(false, null, `Failed to start process: ${errorMessage}`), { status: 500 })
    }
  }

  private async processAsync(data: GenericPayload): Promise<void> {
    try {
      await this.updateProgress(ProcessStates.PROCESSING, 10)

      const providerName = data.provider || 'openai'
      const config = ProviderConfigs[providerName] || ProviderConfigs.openai
      const transformedPayload = this.nimProvider.transformRequest(data, config)

      // 👇 Si el payload pide stream, cada chunk llega por WebSocket en tiempo real
      const result = await this.nimProvider.makeRequest(
        config.endpoint,
        transformedPayload,
        config.format,
        (chunk) => {
          this.broadcastUpdate({
            status: ProcessStates.PROCESSING,
            chunk, // el cliente recibe cada token por WebSocket
          })
        }
      )

      await this.state.storage.put('processState', {
        status: ProcessStates.COMPLETED,
        data,
        result,
        progress: 100,
        completedAt: Date.now(),
      } satisfies ProcessState)

      this.broadcastUpdate({
        status: ProcessStates.COMPLETED,
        progress: 100,
        result,
      })

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
      await this.state.storage.put('processState', {
        status: ProcessStates.FAILED,
        data,
        error: errorMessage,
        progress: 0,
        failedAt: Date.now(),
      } satisfies ProcessState)

      this.broadcastUpdate({ status: ProcessStates.FAILED, error: errorMessage })
    }
  }


  private async updateProgress(status: string, progress: number): Promise<void> {
    const currentState = await this.state.storage.get<ProcessState>('processState')
    if (!currentState) return;

    const updatedState: ProcessState = {
      ...currentState,
      status,
      progress,
      data: currentState.data,
      result: currentState.result,
      error: currentState.error,
      startTime: currentState.startTime,
      completedAt: currentState.completedAt,
      failedAt: currentState.failedAt,
    };
    await this.state.storage.put('processState', updatedState)

    this.broadcastUpdate({ status, progress })
  }

  private async getStatus(): Promise<Response> {
    const processState = await this.state.storage.get<ProcessState>('processState')
    // Ensure a default structure if no state exists, matching ApiResponse<ProcessState>
    if (!processState) {
      // Return a structure that matches ApiResponse<ProcessState>
      const notFoundState: ProcessState = { status: 'not_found', progress: 0 };
      return Response.json(createResponse(true, notFoundState, 'No process found.'))
    }
    // Cast to ApiResponse<ProcessState> to satisfy the return type of createResponse
    return Response.json(createResponse<ProcessState>(true, processState))
  }

  private async handleWebSocket(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') === 'websocket') {
      const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket]

      this.websockets.add(server)

      server.addEventListener('close', () => {
        this.websockets.delete(server)
      })

      server.addEventListener('error', (event) => {
        console.error('WebSocket error:', event)
        this.websockets.delete(server)
      })

      return new Response(null, { status: 101, webSocket: client })
    }

    return new Response('Expected WebSocket', { status: 400 })
  }

  private broadcastUpdate(update: unknown): void {
    const message = JSON.stringify(update)
    for (const ws of this.websockets) {
      try {
        ws.send(message)
      } catch (e) {
        console.error('Failed to send WebSocket message:', e)
        this.websockets.delete(ws) // Remove broken connection
      }
    }
  }
}

/**
 * MAIN APPLICATION ASSEMBLY
 */

const app = new Hono<{ Bindings: Env }>()
const rateLimiter = new RateLimiter()
const encoder = new TextEncoder();

// Middleware Pipeline
app.use('*', cors())
app.use('*', async (c, next) => {
  const clientId = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'anonymous';

  if (!rateLimiter.isAllowed(clientId)) {
    return c.json(createResponse(false, null, 'Rate limit exceeded'), { status: 429 })
  }

  await next()
})

app.onError((err, c) => {
  console.error('Application Error:', err)
  const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
  return c.json(createResponse(false, null, `Internal Server Error: ${errorMessage}`), { status: 500 })
})

const createProviderRoute = (providerName: string) => {
  return async (c: Context<{ Bindings: Env }>) => {
    try {
      const config = ProviderConfigs[providerName]
      if (!config) {
        return c.json(createResponse(false, null, `Unknown provider: ${providerName}`), { status: 400 })
      }

      const result = await parseRequestBody(c.req)
      if (result.error) {
        return c.json(createResponse(false, null, result.error), { status: result.status })
      }

      const nim = getNIMProvider(c.env)
      const transformedPayload = nim.transformRequest(result.payload!, config)
      const isStream = (transformedPayload as Record<string, unknown>).stream === true

      if (!rateLimiter.isAllowed(NVIDIA_RATE_LIMIT_KEY)) {
        return c.json(
          createResponse(false, { code: 'proxy_rate_limited', status: 429 }, 'Proxy rate limit reached before calling NVIDIA. Wait a bit before retrying.'),
          { status: 429 }
        )
      }

      if (isStream) {
        const upstream = await nim.makeStreamRequest(config.endpoint, transformedPayload)
        return new Response(upstream.body, {
          status: upstream.status,
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        })
      }

      const response = await nim.makeRequest(config.endpoint, transformedPayload, config.format)
      return c.json(createResponse(true, response))

    } catch (error) {
      console.error(`[${providerName}] ✘ Provider Error:`, error)
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
      const status = error instanceof ProviderError ? error.status : 500
      const publicMessage = error instanceof ProviderError ? error.publicMessage : `Provider error: ${errorMessage}`
      const errorData = error instanceof ProviderError
        ? { code: error.code, status, ...(error.retryAfter ? { retry_after: error.retryAfter } : {}) }
        : null
      const headers = error instanceof ProviderError && error.retryAfter
        ? { 'Retry-After': error.retryAfter }
        : undefined

      return c.json(createResponse(false, errorData, publicMessage), { status, headers })
    }
  }
}

/**
 * ROUTE DEFINITIONS - SYNCHRONOUS PROVIDERS
 */

// Register routes for specific providers
app.post('/deepseek/v1/chat/completions', createProviderRoute('deepseek'))
app.post('/claude/v1/messages', createProviderRoute('claude'))
app.post('/openai/v1/chat/completions', createProviderRoute('openai'))
app.get('/openai/v1/models', (c) => c.json(createModelsList('openai')))
app.get('/claude/v1/models', (c) => c.json(createModelsList('claude')));
app.get('/openai/models', (c) => c.json(createModelsList('openai')))

/**
 * ROUTE DEFINITIONS - ASYNCHRONOUS PROCESSING
 */

app.post('/api/process', async (c) => {
  try {
    const result = await parseRequestBody(c.req) // Use parseJSONBody for Hono Context
    if (result.error) {
      return c.json(createResponse(false, null, result.error), { status: result.status })
    }

    const processId = crypto.randomUUID()
    const durableObjectId = c.env.PROCESSOR.idFromName(processId)
    const durableObject = c.env.PROCESSOR.get(durableObjectId)

    // Construct the internal request to the Durable Object
    const startRequest = new Request('https://internal/start', {
      method: 'POST',
      body: JSON.stringify(result.payload), // Pass the correctly parsed payload
      headers: { 'Content-Type': 'application/json' } // Ensure content type is set
    });

    // Fetch from the Durable Object
    await durableObject.fetch(startRequest)

    const baseUrl = new URL(c.req.url).origin

    return c.json(createResponse(true, {
      processId,
      statusUrl: `${baseUrl}/api/status/${processId}`,
      streamUrl: `${baseUrl}/api/stream/${processId}`,
      websocketUrl: `${baseUrl}/api/websocket/${processId}`
    }))

  } catch (error) {
    console.error('Process Start Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return c.json(createResponse(false, null, `Failed to start process: ${errorMessage}`), { status: 500 })
  }
})

app.get('/api/status/:processId', async (c) => {
  try {
    const processId = c.req.param('processId')
    const durableObjectId = c.env.PROCESSOR.idFromName(processId)
    const durableObject = c.env.PROCESSOR.get(durableObjectId)

    // Fetch status from the Durable Object
    const response = await durableObject.fetch('https://internal/status')
    const data = await response.json() // This will be ApiResponse<ProcessState>

    // Type assertion for clarity, although Response.json handles generic types well.
    // The actual json() response here should match ApiResponse<ProcessState> structure.
    return c.json(data as ApiResponse<ProcessState>)

  } catch (error) {
    console.error('Status Check Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return c.json(createResponse(false, null, `Error checking status: ${errorMessage}`), { status: 500 })
  }
})

app.get('/api/stream/:processId', async (c) => {
  try {
    const processId = c.req.param('processId')
    const durableObjectId = c.env.PROCESSOR.idFromName(processId)
    const durableObject = c.env.PROCESSOR.get(durableObjectId)

    const controller = new AbortController();
    const stream = new ReadableStream({
      async start(streamController) {
        // Fetch status from the Durable Object
        const statusResponse = await durableObject.fetch('https://internal/status');
        // Explicitly type the JSON response
        const statusData = await statusResponse.json() as ApiResponse<ProcessState>;

        if (statusData.success && statusData.data) {
          const currentState = statusData.data;
          const initialMessage = {
            status: currentState.status || 'connected',
            progress: currentState.progress || 0,
            result: currentState.result,
            error: currentState.error,
            message: 'Streaming endpoint initialized.'
          };
          streamController.enqueue(encoder.encode(`data: ${JSON.stringify(initialMessage)}\n\n`));
        } else {
          streamController.enqueue(encoder.encode(`data: ${JSON.stringify({ status: 'error', message: statusData.error || 'Failed to get initial status.' })}\n\n`));
        }

        streamController.close();
      },
      cancel() {
        controller.abort();
      }
    }, {
      highWaterMark: 1,
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  } catch (error) {
    console.error('Stream Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return new Response(`Stream Error: ${errorMessage}`, { status: 500 })
  }
})

app.get('/api/websocket/:processId', async (c) => {
  try {
    const processId = c.req.param('processId')
    const durableObjectId = c.env.PROCESSOR.idFromName(processId)
    const durableObject = c.env.PROCESSOR.get(durableObjectId)

    // Create a new Request object for the Durable Object's internal websocket endpoint
    const wsRequest = new Request('https://internal/websocket', {
      headers: { 'Upgrade': 'websocket' }
    });

    // Fetch this request from the Durable Object
    return await durableObject.fetch(wsRequest)

  } catch (error) {
    console.error('WebSocket Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return new Response(`WebSocket Connection Error: ${errorMessage}`, { status: 500 })
  }
})

app.get('/health', (c) => {
  return c.json(createResponse(true, {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  }))
})

export default app
