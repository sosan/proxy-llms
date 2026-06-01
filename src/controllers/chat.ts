import { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { Env } from '../interfaces/general'
import { ProviderConfigs, resolveModelFormat } from '../config/providers'
import { ProviderError } from '../errors/provider-error'
import { MetricsCollector } from '../metrics/metrics-collector'
import { getProviderByName } from '../providers/provider-factory'
import { createResponse, parseRequestBody } from '../utils/response'
import { logger } from '../utils/logger'
import { compressMessages, formatRtkLog } from '../transformers/rtk/index'
import { injectCaveman } from '../transformers/rtk/caveman'
import type { CavemanLevel } from '../interfaces/rtk'

// =============================================================================
// TYPES
// =============================================================================

type TransformedPayload = {
  model: string
  stream?: boolean
  [key: string]: unknown
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Extracts and validates the provider prefix from a model string (e.g., "nvidia/gpt-oss" → "nvidia").
 * Returns null if the model format is invalid.
 */
function extractProviderFromModel(model: string): string | null {
  const parts = model.split('/')
  return parts.length >= 2 ? parts[0] : null
}

/**
 * Resolves the provider config or returns an error response.
 */
function resolveProviderConfig(providerDC: string): { config: typeof ProviderConfigs[string] } | { error: string; status: ContentfulStatusCode } {
  const config = ProviderConfigs[providerDC]
  if (!config) {
    const supportedProviders = Object.keys(ProviderConfigs).join(', ')
    return {
      error: `Unknown provider: "${providerDC}". Supported: ${supportedProviders}`,
      status: 400 as ContentfulStatusCode,
    }
  }
  return { config }
}

/**
 * Applies RTK compression and Caveman middleware to the payload.
 * Returns a new payload (no mutation).
 */
function applyPayloadMiddlewares(
  payload: TransformedPayload,
  env: Env,
  config: { format: 'anthropic' | 'openai' | 'google' }
): TransformedPayload {
  let result: TransformedPayload = { ...payload }

  // RTK: compress tool_result content before sending upstream
  if (env.RTK_ENABLED === 'true') {
    const rtkStats = compressMessages(result, true)
    const rtkLine = formatRtkLog(rtkStats)
    if (rtkLine) logger.debug(rtkLine)
  }

  // Caveman: inject terse-style system prompt before sending upstream
  if (env.CAVEMAN_ENABLED === 'true') {
    const cavemanLevel = (env.CAVEMAN_LEVEL || 'full') as CavemanLevel
    injectCaveman(result, config.format, cavemanLevel)
  }

  return result
}

/**
 * Builds a standardized error response from an error.
 */
function buildErrorResponse(error: unknown): {
  status: ContentfulStatusCode
  publicMessage: string
  errorData: { code: string; status: ContentfulStatusCode; retry_after?: string } | null
  headers?: Record<string, string>
} {
  const providerError = error instanceof ProviderError ? error : null
  const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
  const status: ContentfulStatusCode = providerError?.status ?? 500
  const publicMessage = providerError?.publicMessage ?? `Provider error: ${errorMessage}`

  const errorData = providerError
    ? { code: providerError.code, status, ...(providerError.retryAfter ? { retry_after: providerError.retryAfter } : {}) }
    : null

  const headers = providerError?.retryAfter
    ? { 'Retry-After': providerError.retryAfter }
    : undefined

  return { status, publicMessage, errorData, headers }
}

/**
 * Handles streaming requests to the upstream provider.
 */
async function handleStreamRequest(
  provider: ReturnType<typeof getProviderByName>,
  endpoint: string,
  payload: TransformedPayload,
  metricsCollector: MetricsCollector
): Promise<Response> {
  const upstream = await provider.makeStreamRequest(endpoint, payload)
  metricsCollector.setUpstreamStatus(upstream.status)

  if (!upstream.body) {
    throw new ProviderError(
      'Upstream returned a streaming response without a body',
      502 as ContentfulStatusCode,
      'upstream_empty_stream',
      'Upstream returned an empty stream. Retry the request in a few seconds.'
    )
  }

  const transformStream = metricsCollector.createStreamingTransformStream()
  let transformedBody: ReadableStream<Uint8Array> | null = null
  try {
    transformedBody = upstream.body.pipeThrough(transformStream)
  } catch (err) {
    throw new ProviderError(
      `Failed to pipe upstream stream: ${err instanceof Error ? err.message : 'unknown'}`,
      502 as ContentfulStatusCode,
      'upstream_stream_pipe_failed',
      'Failed to process upstream stream. Retry the request in a few seconds.'
    )
  }

  if (!transformedBody) {
    throw new ProviderError(
      'Upstream returned a streaming response without a body',
      502 as ContentfulStatusCode,
      'upstream_empty_stream',
      'Upstream returned an empty stream. Retry the request in a few seconds.'
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

/**
 * Handles non-streaming requests to the upstream provider.
 */
async function handleNonStreamRequest(
  provider: ReturnType<typeof getProviderByName>,
  endpoint: string,
  payload: TransformedPayload,
  config: { format: 'anthropic' | 'openai' | 'google' },
  metricsCollector: MetricsCollector
): Promise<unknown> {
  const response = await provider.makeRequest(endpoint, payload, config.format)
  metricsCollector.recordNonStreamingMetrics(200, response)
  return response
}

// =============================================================================
// CONTROLLER
// =============================================================================

export const handleChatCompletions = async (c: Context<{ Bindings: Env }>) => {
  let metricsCollector: MetricsCollector | null = null

  try {
    // --- Parse ---
    const result = await parseRequestBody(c.req)
    if (result.error) {
      return c.json(createResponse(false, null, result.error), { status: result.status })
    }

    // --- Validate ---
    const payloadModel = result.payload?.model
    if (!payloadModel) {
      return c.json(createResponse(false, null, 'Model not specified in request body'), { status: 400 })
    }

    // --- Resolve provider ---
    const providerDC = extractProviderFromModel(payloadModel)
    if (!providerDC) {
      return c.json(createResponse(false, null, 'Invalid model format. Expected "provider/model"'), { status: 400 })
    }

    const configResult = resolveProviderConfig(providerDC)
    if ('error' in configResult) {
      return c.json(createResponse(false, null, configResult.error), { status: configResult.status })
    }
    const { config } = configResult

    const provider = getProviderByName(c.env, providerDC)

    // --- Transform ---
    const transformedPayload: TransformedPayload = provider.transformRequest(result.payload!, config) as TransformedPayload

    // --- Resolve model format and endpoint ---
    const resolvedModel = transformedPayload.model || 'unknown'
    const modelFormat = resolveModelFormat(providerDC, resolvedModel)
    const endpoint = modelFormat === 'anthropic' && config.alterEndpoint ? config.alterEndpoint : config.endpoint

    // --- Apply middlewares ---
    const finalPayload = applyPayloadMiddlewares(transformedPayload, c.env, { format: modelFormat as 'anthropic' | 'openai' | 'google' })

    // --- Route to stream or non-stream ---
    const isStream = finalPayload.stream === true
    const requestId = crypto.randomUUID().slice(0, 8)

    metricsCollector = new MetricsCollector(c.env, requestId, resolvedModel, providerDC, isStream)

    if (isStream) {
      return handleStreamRequest(provider, endpoint, finalPayload, metricsCollector)
    }

    const response = await handleNonStreamRequest(provider, endpoint, finalPayload, { format: modelFormat as 'anthropic' | 'openai' | 'google' }, metricsCollector)
    return c.json(createResponse(true, response))

  } catch (error) {
    logger.error('Provider Error:', error)

    const { status, publicMessage, errorData, headers } = buildErrorResponse(error)

    if (metricsCollector) {
      const errorType = error instanceof ProviderError ? error.code : 'unknown_error'
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
      metricsCollector.recordNonStreamingMetrics(status, null, {
        type: errorType,
        message: errorMessage,
      })
    }

    return c.json(createResponse(false, errorData, publicMessage), { status, headers })
  }
}
