import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { ProviderConfigs } from '../config/providers'
import { ProviderError } from '../errors/provider-error'
import { MetricsCollector } from '../metrics/metrics-collector'
import { transformOpenAIToClaude } from '../transformers/openai-to-claude'
import { logger } from './logger'

export interface StreamResponseResult {
  response: Response
  body: ReadableStream
  upstreamStatus: number
}

export function buildErrorResponse(
  status: number,
  errorMessage: string
): Response {
  return new Response(
    JSON.stringify({ success: false, data: null, error: errorMessage }),
    { status, headers: { 'Content-Type': 'application/json' } }
  )
}
