import { Hono, Context, HonoRequest } from 'hono'
import { cors } from 'hono/cors'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { Env, ApiResponse, MessageContentPart, ChatMessage, GenericPayload, ProcessState, ProviderConfig } from './interfaces/general'


// =============================================================================
// STRUCTURED PROMPT-DRIVEN DEVELOPMENT PATTERN
// =============================================================================

/**
 * ENVIRONMENT BINDINGS
 */
// interface Env {
//   NVIDIA_API_KEY: string
//   NVIDIA_BASE_URL: string
//   PROCESSOR: DurableObjectNamespace
// }

/**
 * SYSTEM CONTRACTS & INTERFACES
 */

// Define ApiResponse and ProcessState more precisely if not globally available or for clarity
// interface ApiResponse<T = unknown> {
//   success: boolean
//   data: T | null
//   error: string | null
//   timestamp: string
// }

// // Define the structure for content parts within a message
// interface MessageContentPart {
//   type: 'text' | 'image'; // Add other types as needed
//   text?: string;
//   image_url?: { url: string }; // Example for image
// }

// // Define the structure for chat messages
// interface ChatMessage {
//   role: 'system' | 'user' | 'assistant' | 'tool';
//   content: string | MessageContentPart[];
// }

// // Structure for the generic payload sent by the client
// interface GenericPayload {
//   provider?: string; // Explicitly specify the provider
//   model?: string;    // The model alias or full ID to use
//   messages?: ChatMessage[]; // Messages array for chat completions
//   content?: string | MessageContentPart[];  // Fallback for single string content (e.g., some older OpenAI/completion APIs)
//   temperature?: number;
//   top_p?: number;
//   max_tokens?: number;
//   stream?: boolean;
//   stream_options?: unknown; // Keep flexible for different provider stream options
//   // Fields specific to certain models or providers that might not fit the common structure
//   // For example, chat_template_kwargs is specific to some models like GLM
//   [key: string]: unknown; // Allow for any additional provider-specific fields
// }

// interface ProcessState {
//   status: string
//   data?: GenericPayload // Store the original payload
//   result?: unknown
//   error?: string
//   startTime?: number
//   completedAt?: number
//   failedAt?: number
//   progress: number
// }

// interface ProviderConfig {
//   endpoint: string;
//   models: Record<string, string>; // alias: 'provider/model-id'
//   format: 'anthropic' | 'openai'; // The format expected by the target API
// }

// Standard API Response Contract
const createResponse = <T>(success: boolean, data: T | null, error: string | null = null): ApiResponse<T> => ({
  success,
  data,
  error,
  timestamp: new Date().toISOString()
})

// --- Adapted parseJSONBody for Durable Objects ---
// This function takes a Request object and returns a parsed payload or an error.
// Modified to accept HonoRequest as well, by using request.json() which is available on both.
const parseRequestBody = async (request: Request | HonoRequest): Promise<{ payload: GenericPayload; error?: undefined; status?: undefined } | { error: string; status: ContentfulStatusCode; payload?: undefined }> => {
  let payload: unknown
  try {
    // Use request.json() directly as it's available on Request and HonoRequest
    payload = await request.json()
  } catch {
    return { error: 'Invalid or missing request body: expected valid JSON', status: 400 as ContentfulStatusCode }
  }

  if (payload == null || typeof payload !== 'object') {
    return { error: 'Request body must be a non-null JSON object', status: 400 as ContentfulStatusCode }
  }

  const genericPayload = payload as GenericPayload;
  // Basic validation: ensure messages or content is present if it's a chat-like request
  if (!genericPayload.messages && !genericPayload.content && !genericPayload.provider) {
    // This check might be too strict depending on all use cases.
    // For now, it's a hint that something might be missing if it's not a simple API call.
  }

  return { payload: genericPayload }
}


// Process States Contract
const ProcessStates = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed'
} as const

// Provider Configuration Contract
const ProviderConfigs: Record<string, ProviderConfig> = {
  claude: {
    endpoint: '/claude/v1/messages',
    models: {
      'claude-3.5-sonnet': 'anthropic/claude-3.5-sonnet-20240620',
      'claude-3-opus':     'anthropic/claude-3-opus-20240229',
      'claude-3-haiku':    'anthropic/claude-3-haiku-20240307'
    },
    format: 'anthropic'
  },
  openai: {
    endpoint: '/openai/v1/chat/completions',
    models: {
      'gpt-oss-120b':       'openai/gpt-oss-120b',
      'gpt-4o':             'openai/gpt-4o',
      'gpt-4o-mini':        'openai/gpt-4o-mini',
      'glm4.7':             'z-ai/glm4.7', // Alias for GLM4.7 specific handling
      'deepseek-v4-pro':    'deepseek-ai/deepseek-v4-pro', // This alias might conflict with a specific 'deepseek' provider.
      'deepseek-r1':        'deepseek-ai/deepseek-r1',
      'deepseek-v3':        'deepseek-ai/deepseek-v3'
    },
    format: 'openai'
  },
  // Added a specific deepseek config, assuming it follows openai format
  deepseek: {
    endpoint: '/deepseek/v1/chat/completions',
    models: {
      'deepseek-v4-pro':    'deepseek-ai/deepseek-v4-pro',
      'deepseek-r1':        'deepseek-ai/deepseek-r1',
      'deepseek-v3':        'deepseek-ai/deepseek-v3'
    },
    format: 'openai'
  }
}

// Helper to resolve the full model ID from a config.
const resolveModel = (config: ProviderConfig, payloadModel: string | null | undefined): string => {
  const aliases = config.models;
  const fullIds = Object.values(aliases);

  if (payloadModel) {
    if (aliases[payloadModel]) {
      return aliases[payloadModel]; // Found an alias
    }
    // Allow passing full model ID directly
    if (fullIds.includes(payloadModel)) {
      return payloadModel;
    }
    // If it's not an alias and not a full ID, assume it's an unsupported alias
    throw new Error(
      `Model alias "${payloadModel}" is not supported by this provider config. Supported aliases: ${Object.keys(aliases).join(', ')}`
    );
  }

  // Return the default model if none is specified
  const defaultAlias = Object.keys(aliases)[0];
  return aliases[defaultAlias];
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

  constructor(apiKey: string, baseUrl: string) {
    this.apiKey = apiKey
    this.baseUrl = baseUrl
  }

  async makeRequest(endpoint: string, payload: unknown, configFormat: string): Promise<unknown> {
    const headers: Record<string, string> = {
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
        let errorMessage = `NIM API Error: ${response.status} ${response.statusText}`;
        try {
          const errorBody = await response.json();
          if (typeof errorBody === 'object' && errorBody !== null && 'error' in errorBody) {
            errorMessage = `NIM API Error: ${response.status} - ${JSON.stringify(errorBody.error)}`;
          } else if (typeof errorBody === 'object' && errorBody !== null && 'message' in errorBody) {
            errorMessage = `NIM API Error: ${response.status} - ${errorBody.message}`;
          } else if (typeof errorBody === 'object' && errorBody !== null) {
            errorMessage = `NIM API Error: ${response.status} - ${JSON.stringify(errorBody)}`;
          }
        } catch (e) {
          console.warn("Could not parse error response body from NIM API:", e);
        }
        throw new Error(errorMessage);
      }

      return await response.json()
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`NIM Provider Error: ${error.message}`)
      } else {
        throw new Error(`NIM Provider Error: An unknown error occurred`)
      }
    }
  }

  // Modified to accept GenericPayload and transform it for specific providers
  transformRequest(payload: GenericPayload, config: ProviderConfig): unknown {
    const model = resolveModel(config, payload.model); // Use the resolved model

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
      model: model, // Use the resolved model ID
      messages: messages,
      temperature: payload.temperature ?? (config.format === 'openai' ? 0.7 : 1.0), // Default temps
      top_p: payload.top_p ?? 1,
      max_tokens: payload.max_tokens ?? (config.format === 'openai' ? 2048 : 32768), // Default max_tokens
      stream: payload.stream ?? false,
    };

    // Add provider-specific fields by merging payload's unknown fields
    // This allows passing fields like 'chat_template_kwargs' from GenericPayload
    for (const key in payload) {
      // Avoid overwriting common fields already handled, unless the payload explicitly provides them
      if (!(key in commonPayload) || payload[key] !== undefined) {
         // Handle potential specific fields like chat_template_kwargs if they exist in payload
         if (key === 'chat_template_kwargs' && config.format === 'openai') { // Example: GLM needs this, assume OpenAI format can handle it or we transform later
             commonPayload[key] = payload[key];
         } else if (key !== 'provider' && key !== 'model' && key !== 'content' && key !== 'messages') { // Don't re-add already processed or routing fields
             commonPayload[key] = payload[key];
         }
      }
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
      // Use the adapted parseRequestBody helper
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

      for (let i = 20; i <= 80; i += 20) {
        await new Promise(resolve => setTimeout(resolve, 1000))
        await this.updateProgress(ProcessStates.PROCESSING, i)
      }

      const providerName = data.provider || 'openai';
      const config = ProviderConfigs[providerName] || ProviderConfigs.openai;

      const transformedPayload = this.nimProvider.transformRequest(data, config);
      const result = await this.nimProvider.makeRequest(config.endpoint, transformedPayload, config.format);

      await this.state.storage.put('processState', {
        status: ProcessStates.COMPLETED,
        data: data,
        result: result,
        progress: 100,
        completedAt: Date.now()
      } satisfies ProcessState)

      this.broadcastUpdate({
        status: ProcessStates.COMPLETED,
        progress: 100,
        result
      })

    } catch (error) {
      console.error('Process Async Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      await this.state.storage.put('processState', {
        status: ProcessStates.FAILED,
        data: data,
        error: errorMessage,
        progress: 0,
        failedAt: Date.now()
      } satisfies ProcessState)

      this.broadcastUpdate({
        status: ProcessStates.FAILED,
        error: errorMessage
      })
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

/**
 * ROUTE DEFINITIONS - SYNCHRONOUS PROVIDERS
 */

const createProviderRoute = (providerName: string) => {
  return async (c: Context<{ Bindings: Env }>) => {
    try {
      const config = ProviderConfigs[providerName]
      if (!config) {
        return c.json(createResponse(false, null, `Unknown provider: ${providerName}`), { status: 400 })
      }

      // Pass c.req directly to parseRequestBody, as it now accepts HonoRequest
      const result = await parseRequestBody(c.req)
      if (result.error) {
        return c.json(createResponse(false, null, result.error), { status: result.status })
      }

      const nim = getNIMProvider(c.env)
      const transformedPayload = nim.transformRequest(result.payload!, config)
      const response = await nim.makeRequest(config.endpoint, transformedPayload, config.format)

      return c.json(createResponse(true, response))

    } catch (error) {
      console.error(`${providerName} Provider Error:`, error)
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      return c.json(createResponse(false, null, `Provider error: ${errorMessage}`), { status: 500 })
    }
  }
}

// Register routes for specific providers
app.post('/deepseek/v1/chat/completions', createProviderRoute('deepseek'))
app.post('/claude/v1/messages', createProviderRoute('claude'))
app.post('/openai/v1/chat/completions', createProviderRoute('openai'))

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