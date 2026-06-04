import { Env, GenericPayload, ProcessState } from '../interfaces/general'
import { ProviderConfigs, resolveModelFormat } from '../config/providers'
import { getProviderByName } from '../providers/provider-factory'
import { createResponse, parseRequestBody } from '../utils/response'

// Process States Contract
const ProcessStates = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed'
} as const

const PROCESS_STATE_STORAGE_KEY = 'state'

export class ProcessorDurableObject {
  private readonly websockets = new Set<WebSocket>()

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/start' && request.method === 'POST') {
      return this.start(request)
    }

    if (url.pathname === '/status') {
      return this.status()
    }

    if (url.pathname === '/websocket') {
      return this.websocket()
    }

    return new Response('Not found', { status: 404 })
  }

  private async start(request: Request): Promise<Response> {
    const result = await parseRequestBody(request)
    if (result.error) {
      return Response.json(createResponse(false, null, result.error), { status: result.status })
    }

    const payload = this.preparePayload(result.payload!)
    const processState: ProcessState = {
      status: ProcessStates.PENDING,
      data: payload,
      startTime: Date.now(),
      progress: 0,
    }

    await this.state.storage.put(PROCESS_STATE_STORAGE_KEY, processState)
    this.state.waitUntil(this.processAsync(payload))

    return Response.json(createResponse(true, {
      status: ProcessStates.PENDING,
      message: 'Process started',
    }))
  }

  private async status(): Promise<Response> {
    const state = await this.state.storage.get<ProcessState>(PROCESS_STATE_STORAGE_KEY)

    return Response.json(createResponse(true, state ?? {
      status: ProcessStates.PENDING,
      progress: 0,
    }))
  }

  private async websocket(): Promise<Response> {
    const state = await this.state.storage.get<ProcessState>(PROCESS_STATE_STORAGE_KEY)
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket]

    server.accept()
    this.websockets.add(server)
    server.send(JSON.stringify(createResponse(true, state ?? {
      status: ProcessStates.PENDING,
      progress: 0,
    })))
    server.addEventListener('close', () => this.websockets.delete(server))
    server.addEventListener('error', () => this.websockets.delete(server))

    return new Response(null, {
      status: 101,
      webSocket: client,
    })
  }

  private preparePayload(payload: GenericPayload): GenericPayload {
    if (payload.provider) {
      return payload
    }

    if (!payload.model) {
      return { ...payload, provider: 'nvidia', model: 'gpt-oss-120b' }
    }

    const provider = Object.entries(ProviderConfigs).find(([, config]) => {
      return Boolean(config.models[payload.model!]) || Object.values(config.models).includes(payload.model!)
    })?.[0] ?? 'nvidia'

    return { ...payload, provider }
  }

  private async processAsync(payload: GenericPayload): Promise<void> {
    try {
      await this.updateState({
        status: ProcessStates.PROCESSING,
        progress: 10,
      })

      const providerName = payload.provider || 'nvidia'
      const config = ProviderConfigs[providerName]
      if (!config) {
        throw new Error(`Unknown provider config: ${providerName}`)
      }

      const provider = getProviderByName(this.env, providerName)
      const transformedPayload = provider.transformRequest(payload, config)
      const format = resolveModelFormat(payload.model || '')
      const result = await provider.makeRequest(config.endpoint, transformedPayload, format)

      await this.updateState({
        status: ProcessStates.COMPLETED,
        result,
        completedAt: Date.now(),
        progress: 100,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
      await this.updateState({
        status: ProcessStates.FAILED,
        error: errorMessage,
        failedAt: Date.now(),
        progress: 0,
      })
    }
  }

  private async updateState(update: Partial<ProcessState>): Promise<void> {
    const currentState = await this.state.storage.get<ProcessState>(PROCESS_STATE_STORAGE_KEY)
    const nextState: ProcessState = {
      status: ProcessStates.PENDING,
      progress: 0,
      ...currentState,
      ...update,
    }

    await this.state.storage.put(PROCESS_STATE_STORAGE_KEY, nextState)
    this.broadcast(nextState)
  }

  private broadcast(state: ProcessState): void {
    const message = JSON.stringify(createResponse(true, state))

    for (const websocket of this.websockets) {
      try {
        websocket.send(message)
      } catch {
        this.websockets.delete(websocket)
      }
    }
  }
}
