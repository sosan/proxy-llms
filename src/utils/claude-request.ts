import { ProviderConfigs } from '../config/providers'
import { GenericPayload } from '../interfaces/general'
import { createResponse } from './response'

export interface ParsedClaudeRequest {
  providerDC: string
  payload: GenericPayload
}

export interface ParseError {
  error: true
  response: Response
}

export type ParseResult = ParsedClaudeRequest | ParseError

export function isParseError(result: ParseResult): result is ParseError {
  return 'error' in result && result.error === true
}

export function parseClaudeRequest(
  payload: GenericPayload | undefined
): ParseResult {
  if (!payload) {
    return {
      error: true,
      response: new Response(
        JSON.stringify(createResponse(false, null, 'Invalid or missing request body: expected valid JSON')),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      ),
    }
  }

  const model = payload.model as string | undefined
  if (!model) {
    return {
      error: true,
      response: new Response(
        JSON.stringify(createResponse(false, null, 'Model not specified in request body')),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      ),
    }
  }

  const providerDC = model.split('/')[0]
  if (!providerDC) {
    return {
      error: true,
      response: new Response(
        JSON.stringify(createResponse(false, null, 'Invalid model format. Expected "provider/model"')),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      ),
    }
  }

  const config = ProviderConfigs[providerDC]
  if (!config) {
    const supportedProviders = Object.keys(ProviderConfigs).join(', ')
    return {
      error: true,
      response: new Response(
        JSON.stringify(createResponse(false, null, `Unknown provider: "${providerDC}". Supported: ${supportedProviders}`)),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      ),
    }
  }

  return { providerDC, payload }
}
