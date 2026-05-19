import { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { Env } from '../interfaces/general'
import { ProviderConfigs } from '../config/providers'
import { ProviderError } from '../errors/provider-error'
import { MetricsCollector } from '../metrics/metrics-collector'
import { getProviderByName } from '../providers/provider-factory'
import { createResponse, parseRequestBody } from '../utils/response'
import { logger } from '../utils/logger'

export const handleChatCompletions = async (c: Context<{ Bindings: Env }>) => {
  let metricsCollector: MetricsCollector | null = null

  try {
    const result = await parseRequestBody(c.req)
    if (result.error) {
      return c.json(createResponse(false, null, result.error), { status: result.status })
    }

    const payloadModel = result.payload?.model as string | undefined
    if (!payloadModel) {
      return c.json(createResponse(false, null, 'Model not specified in request body'), { status: 400 })
    }

    const providerDC = payloadModel.split('/')[0]
    if (!providerDC) {
      return c.json(createResponse(false, null, 'Invalid model format. Expected "provider/model"'), { status: 400 })
    }

    const config = ProviderConfigs[providerDC]
    if (!config) {
      const supportedProviders = Object.keys(ProviderConfigs).join(', ')
      return c.json(createResponse(false, null,
        `Unknown provider: "${providerDC}". Supported: ${supportedProviders}`), { status: 400 })
    }

    const provider = getProviderByName(c.env, providerDC)

    const transformedPayload = provider.transformRequest(result.payload!, config)
    const isStream = (transformedPayload as Record<string, unknown>).stream === true
    const model = (transformedPayload as Record<string, unknown>).model as string || 'unknown'
    const requestId = crypto.randomUUID().slice(0, 8)

    metricsCollector = new MetricsCollector(c.env, requestId, model, providerDC, isStream)

    if (isStream) {
      const upstream = await provider.makeStreamRequest(config.endpoint, transformedPayload)
      metricsCollector.setUpstreamStatus(upstream.status)

      const transformStream = metricsCollector.createStreamingTransformStream()
      const transformedBody = upstream.body?.pipeThrough(transformStream)

      if (!transformedBody) {
        throw new ProviderError(
          'NVIDIA returned a streaming response without a body',
          502 as ContentfulStatusCode,
          'upstream_empty_stream',
          'NVIDIA returned an empty stream. Retry the request in a few seconds.'
        )
      }

      const headers = new Headers(upstream.headers)
      headers.set('Content-Type', 'text/event-stream')
      headers.set('Cache-Control', 'no-cache')
      headers.set('Connection', 'keep-alive')
      headers.delete('Content-Length')

      return new Response(transformedBody, {
        status: upstream.status,
        headers,
      })
    }

    const response = await provider.makeRequest(config.endpoint, transformedPayload, config.format)
    metricsCollector.recordNonStreamingMetrics(200, response)

    return c.json(createResponse(true, response))

  } catch (error) {
    logger.error(`Provider Error:`, error)
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
    const status = error instanceof ProviderError ? error.status : 500
    const publicMessage = error instanceof ProviderError ? error.publicMessage : `Provider error: ${errorMessage}`
    const errorData = error instanceof ProviderError
      ? { code: error.code, status, ...(error.retryAfter ? { retry_after: error.retryAfter } : {}) }
      : null
    const headers = error instanceof ProviderError && error.retryAfter
      ? { 'Retry-After': error.retryAfter }
      : undefined

    if (metricsCollector) {
      const errorType = error instanceof ProviderError ? error.code : 'unknown_error'
      metricsCollector.recordNonStreamingMetrics(status, null, {
        type: errorType,
        message: errorMessage
      })
    }

    return c.json(createResponse(false, errorData, publicMessage), { status, headers })
  }
}
