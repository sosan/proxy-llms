import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { Context } from 'hono'

import { Env, GenericPayload } from '../interfaces/general'
import {
  ProviderConfigs,
  resolveAnthropicModel,
  ModelDefaultsById,
} from '../config/providers'

import { ProviderError } from '../errors/provider-error'
import { MetricsCollector } from '../metrics/metrics-collector'
import { getProviderByName } from '../providers/provider-factory'

import {
  parseRequestBody,
  createResponse,
} from '../utils/response'

import { logger } from '../utils/logger'

import { transformClaudeToOpenAI } from '../transformers/claude-to-openai'
import { transformOpenAIToClaude } from '../transformers/openai-to-claude'
import { createOpenAIStreamToClaudeTransformStream } from '../transformers/openai-stream-to-claude'

import { getUserFacingErrorMessage } from '../utils/error-formatter'

export const handleClaudeMessages = async (
  c: Context<{ Bindings: Env }>
) => {
  let metricsCollector: MetricsCollector | null = null

  const log = logger.withEnv(c.env)

  try {
    // -- 1. Parse & validate request body ------------------------------------

    const bodyResult = await parseRequestBody(c.req)

    if (bodyResult.error) {
      return c.json(
        createResponse(false, null, bodyResult.error),
        { status: bodyResult.status }
      )
    }

    const claudePayload = bodyResult.payload!

    // -- 2. Resolve model mapping (before knowing provider format) ----------

    const payloadModel = claudePayload.model as string | undefined

    if (!payloadModel) {
      return c.json(
        createResponse(false, null, 'Model not specified in request body'),
        { status: 400 }
      )
    }

    const envMap = {
      ANTHROPIC_OPUS_MODEL: c.env.ANTHROPIC_OPUS_MODEL,
      ANTHROPIC_SONNET_MODEL: c.env.ANTHROPIC_SONNET_MODEL,
      ANTHROPIC_HAIKU_MODEL: c.env.ANTHROPIC_HAIKU_MODEL,
      ANTHROPIC_DEFAULT_MODEL: c.env.ANTHROPIC_DEFAULT_MODEL,
    }

    const mappedModel = resolveAnthropicModel(
      envMap,
      payloadModel
    )

    if (mappedModel === '') {
      return c.json(
        createResponse(false, null, 'Mapped model is empty'),
        { status: 400 }
      )
    }

    if (mappedModel === payloadModel) {
      return c.json(
        createResponse(
          false,
          null,
          `Model "${payloadModel}" is not mapped to a gateway model. Please specify a model alias in the request body that maps to a supported gateway model.`
        ),
        { status: 400 }
      )
    }

    log.info(
      `Mapped Claude model "${payloadModel}" -> "${mappedModel}"`
    )

    log.debug('[Claude Messages] Incoming payload', {
      model: payloadModel,
      hasMessages:
        Array.isArray(claudePayload.messages) &&
        claudePayload.messages.length > 0,

      messageCount: Array.isArray(claudePayload.messages)
        ? claudePayload.messages.length
        : 0,

      keys: Object.keys(claudePayload),
    })

    // -- 3. Resolve provider & validate --------------------------------------

    const providerDC = mappedModel.split('/')[0]

    if (!providerDC) {
      return c.json(
        createResponse(
          false,
          null,
          'Invalid model format. Expected "provider/model"'
        ),
        { status: 400 }
      )
    }

    const config = ProviderConfigs[providerDC]

    if (!config) {
      const supportedProviders = Object.keys(
        ProviderConfigs
      ).join(', ')

      return c.json(
        createResponse(
          false,
          null,
          `Unknown provider: "${providerDC}". Supported: ${supportedProviders}`
        ),
        { status: 400 }
      )
    }

    // -- 4. Determine if provider supports Anthropic-compatible endpoint -----

    const useAlterEndpoint = !!config.alterEndpoint

    const targetEndpoint = useAlterEndpoint
      ? config.alterEndpoint!
      : config.endpoint

    log.info(
      `[Claude Messages] Using endpoint: ${targetEndpoint}${useAlterEndpoint
        ? ' (alterEndpoint — Claude format passthrough)'
        : ''
      }`
    )

    // -- 5. Build payload & resolve provider ---------------------------------

    const provider = getProviderByName(c.env, providerDC)

    const modelParts = mappedModel.split('/')

    const modelName =
      modelParts.length > 1
        ? modelParts.slice(1).join('/')
        : mappedModel

    let transformedPayload: Record<string, unknown>
    let model: string
    let isStream: boolean

    if (useAlterEndpoint) {
      // alterEndpoint path: keep Claude format, apply model defaults directly

      const modelDefaults =
        ModelDefaultsById[modelName] ?? {}

      transformedPayload = {
        ...claudePayload,
        ...modelDefaults.extra,

        model: modelName,

        temperature:
          claudePayload.temperature ??
          modelDefaults.temperature,

        top_p:
          claudePayload.top_p ??
          modelDefaults.top_p,

        max_tokens:
          claudePayload.max_tokens ??
          modelDefaults.max_tokens,

        stream:
          claudePayload.stream ??
          modelDefaults.stream ??
          false,
      }

      model = modelName

      isStream = transformedPayload.stream === true

      log.debug(
        '[Claude Messages] alterEndpoint payload (Claude format)',
        {
          model,
          isStream,
          keys: Object.keys(transformedPayload),
        }
      )
    } else {
      // Standard path: transform to provider format (e.g., OpenAI)

      let genericPayload: GenericPayload

      switch (config.format) {
        case 'openai':
          genericPayload =
            transformClaudeToOpenAI(claudePayload)

          genericPayload.model = modelName

          break

        case 'anthropic':
          // Claude-to-Claude passthrough
          // (provider natively accepts Claude format)

          genericPayload = {
            ...claudePayload,
          }

          genericPayload.model = modelName

          break

        default:
          return c.json(
            createResponse(
              false,
              null,
              `Provider "${providerDC}" format "${config.format}" is not supported by the /messages endpoint.`
            ),
            { status: 400 }
          )
      }

      log.debug(
        '[Claude Messages] Transformed request',
        {
          model: genericPayload.model,
          format: config.format,
          keys: Object.keys(genericPayload),
        }
      )

      transformedPayload = provider.transformRequest(
        genericPayload,
        config
      ) as Record<string, unknown>

      model =
        (transformedPayload.model as string) ||
        'unknown'

      isStream = transformedPayload.stream === true
    }

    // -- 6. Set up metrics ---------------------------------------------------

    const requestId = crypto.randomUUID().slice(0, 8)

    metricsCollector = new MetricsCollector(
      c.env,
      requestId,
      model,
      providerDC,
      isStream
    )

    // -- 7a. Streaming response ----------------------------------------------

    if (isStream) {
      return handleStream(
        c,
        provider,
        targetEndpoint,
        transformedPayload,
        metricsCollector,
        useAlterEndpoint
      )
    }

    // -- 7b. Non-streaming response ------------------------------------------

    return handleNonStream(
      c,
      provider,
      targetEndpoint,
      transformedPayload,
      metricsCollector,
      useAlterEndpoint,
      config.format
    )
  } catch (error) {
    return handleClaudeError(
      c,
      error,
      metricsCollector,
      log
    )
  }
}

// -- Helper: streaming ------------------------------------------------------

async function handleStream(
  c: Context,
  provider: any,
  endpoint: string,
  payload: unknown,
  metricsCollector: MetricsCollector,
  useAlterEndpoint: boolean
): Promise<Response> {
  const log = logger.withEnv(c.env)

  log.debug(
    '[handleStream] Starting streaming request to upstream',
    {
      endpoint,
      useAlterEndpoint,
    }
  )

  const upstream = await provider.makeStreamRequest(
    endpoint,
    payload
  )

  log.debug(
    '[handleStream] Upstream response received',
    {
      status: upstream.status,
      contentType: upstream.headers.get('content-type'),
      hasBody: !!upstream.body,
    }
  )

  metricsCollector.setUpstreamStatus(upstream.status)

  if (!upstream.body) {
    throw new ProviderError(
      'Provider returned a streaming response without a body',
      502 as ContentfulStatusCode,
      'upstream_empty_stream',
      'Provider returned an empty stream. Retry the request in a few seconds.'
    )
  }

  const metricsStream =
    metricsCollector.createStreamingTransformStream()

  let transformedBody: ReadableStream

  // When alterEndpoint is used, upstream already returns Claude SSE format
  // skip OpenAI→Claude transform

  if (useAlterEndpoint) {
    transformedBody = upstream.body.pipeThrough(
      metricsStream
    )

    log.debug(
      '[handleStream] Stream pipelines configured (metrics only — Claude format passthrough)'
    )
  } else {
    const formatTransformStream =
      createOpenAIStreamToClaudeTransformStream(log)

    transformedBody = upstream.body
      .pipeThrough(metricsStream)
      .pipeThrough(formatTransformStream)

    log.debug(
      '[handleStream] Stream pipelines configured (metrics + format transform)'
    )
  }

  const headers = new Headers()

  headers.set('Content-Type', 'text/event-stream')
  headers.set('Cache-Control', 'no-cache')
  headers.set('Connection', 'keep-alive')
  headers.set('X-Accel-Buffering', 'no')

  headers.delete('Content-Length')

  return new Response(transformedBody, {
    status: upstream.status,
    headers,
  })
}

// -- Helper: non-streaming --------------------------------------------------

async function handleNonStream(
  c: Context,
  provider: any,
  endpoint: string,
  payload: unknown,
  metricsCollector: MetricsCollector,
  useAlterEndpoint: boolean,
  configFormat: string
): Promise<Response> {
  const upstreamResponse = await provider.makeRequest(
    endpoint,
    payload,
    configFormat
  )

  metricsCollector.recordNonStreamingMetrics(
    200,
    upstreamResponse
  )

  // When alterEndpoint is used, upstream already returns Claude format
  // skip OpenAI→Claude transform

  if (useAlterEndpoint) {
    return c.json(upstreamResponse)
  }

  const claudeResponse = transformOpenAIToClaude(
    upstreamResponse as Record<string, unknown>
  )

  return c.json(claudeResponse)
}

// -- Helper: error handler --------------------------------------------------

function handleClaudeError(
  c: Context,
  error: unknown,
  metricsCollector: MetricsCollector | null,
  log: ReturnType<typeof logger.withEnv>
): Response {
  log.error(`Provider Error (Claude):`, error)

  const errorMessage =
    error instanceof Error
      ? error.message
      : 'An unknown error occurred'

  const status =
    error instanceof ProviderError
      ? error.status
      : 500

  const publicMessage =
    error instanceof Error
      ? getUserFacingErrorMessage(error)
      : 'Provider request failed unexpectedly.'

  const errorData =
    error instanceof ProviderError
      ? {
        code: error.code,
        status,
        ...(error.retryAfter
          ? { retry_after: error.retryAfter }
          : {}),
      }
      : null

  // Propagate upstream rate-limit to client so they can back off

  const responseHeaders = new Headers()

  if (status === 429) {
    const retryAfter =
      error instanceof ProviderError
        ? error.retryAfter
        : undefined

    if (retryAfter) {
      responseHeaders.set(
        'Retry-After',
        retryAfter
      )
    }

    log.warn(
      `[handleClaudeError] Propagating 429 to client${retryAfter
        ? ` (Retry-After: ${retryAfter})`
        : ''
      }`
    )
  }

  if (metricsCollector) {
    const errorType =
      error instanceof ProviderError
        ? error.code
        : 'unknown_error'

    metricsCollector.recordNonStreamingMetrics(
      status,
      null,
      {
        type: errorType,
        message: errorMessage,
      }
    )
  }

  // Convert plain object headers to a Record for Hono

  const headersRecord: Record<string, string> = {}

  responseHeaders.forEach((value, key) => {
    headersRecord[key] = value
  })

  return c.json(
    createResponse(
      false,
      errorData,
      publicMessage
    ),
    {
      status,
      headers:
        Object.keys(headersRecord).length > 0
          ? headersRecord
          : undefined,
    }
  )
}
