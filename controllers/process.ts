import { Context } from 'hono'
import { Env, ApiResponse, ProcessState } from '../interfaces/general'
import { createResponse, parseRequestBody } from '../utils/response'
import { logger } from '../utils/logger'

const encoder = new TextEncoder()

export const handleProcess = async (c: Context<{ Bindings: Env }>) => {
  try {
    const result = await parseRequestBody(c.req)
    if (result.error) {
      return c.json(createResponse(false, null, result.error), { status: result.status })
    }

    const processId = crypto.randomUUID()
    const durableObjectId = c.env.PROCESSOR.idFromName(processId)
    const durableObject = c.env.PROCESSOR.get(durableObjectId)

    const startRequest = new Request('https://internal/start', {
      method: 'POST',
      body: JSON.stringify(result.payload),
      headers: { 'Content-Type': 'application/json' }
    })

    await durableObject.fetch(startRequest)

    const baseUrl = new URL(c.req.url).origin

    return c.json(createResponse(true, {
      processId,
      statusUrl: `${baseUrl}/api/status/${processId}`,
      streamUrl: `${baseUrl}/api/stream/${processId}`,
      websocketUrl: `${baseUrl}/api/websocket/${processId}`
    }))

  } catch (error) {
    logger.error('Process Start Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
    return c.json(createResponse(false, null, `Failed to start process: ${errorMessage}`), { status: 500 })
  }
}

export const handleStatus = async (c: Context<{ Bindings: Env }>) => {
  try {
    const processId = c.req.param('processId')
    if (!processId) {
      return c.json(createResponse(false, null, 'Process ID not specified in URL'), { status: 400 })
    }
    const durableObjectId = c.env.PROCESSOR.idFromName(processId)
    const durableObject = c.env.PROCESSOR.get(durableObjectId)

    const response = await durableObject.fetch('https://internal/status')
    const data = await response.json()

    return c.json(data as ApiResponse<ProcessState>)

  } catch (error) {
    logger.error('Status Check Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
    return c.json(createResponse(false, null, `Error checking status: ${errorMessage}`), { status: 500 })
  }
}

export const handleStream = async (c: Context<{ Bindings: Env }>) => {
  try {
    const processId = c.req.param('processId')
    if (!processId) {
      return c.json(createResponse(false, null, 'Process ID not specified in URL'), { status: 400 })
    }
    const durableObjectId = c.env.PROCESSOR.idFromName(processId)
    const durableObject = c.env.PROCESSOR.get(durableObjectId)

    const controller = new AbortController()
    const stream = new ReadableStream({
      async start(streamController) {
        const statusResponse = await durableObject.fetch('https://internal/status')
        const statusData = await statusResponse.json() as ApiResponse<ProcessState>

        if (statusData.success && statusData.data) {
          const currentState = statusData.data
          const initialMessage = {
            status: currentState.status || 'connected',
            progress: currentState.progress || 0,
            result: currentState.result,
            error: currentState.error,
            message: 'Streaming endpoint initialized.'
          }
          streamController.enqueue(encoder.encode(`data: ${JSON.stringify(initialMessage)}\n\n`))
        } else {
          streamController.enqueue(encoder.encode(`data: ${JSON.stringify({ status: 'error', message: statusData.error || 'Failed to get initial status.' })}\n\n`))
        }

        streamController.close()
      },
      cancel() {
        controller.abort()
      }
    }, {
      highWaterMark: 1,
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })
  } catch (error) {
    logger.error('Stream Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
    return new Response(`Stream Error: ${errorMessage}`, { status: 500 })
  }
}

export const handleWebSocket = async (c: Context<{ Bindings: Env }>) => {
  try {
    const processId = c.req.param('processId')
    if (!processId) {
      return c.json(createResponse(false, null, 'Process ID not specified in URL'), { status: 400 })
    }
    const durableObjectId = c.env.PROCESSOR.idFromName(processId)
    const durableObject = c.env.PROCESSOR.get(durableObjectId)

    const wsRequest = new Request('https://internal/websocket', {
      headers: { 'Upgrade': 'websocket' }
    })

    return await durableObject.fetch(wsRequest)

  } catch (error) {
    logger.error('WebSocket Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
    return new Response(`WebSocket Connection Error: ${errorMessage}`, { status: 500 })
  }
}
