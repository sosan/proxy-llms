import { resolveAnthropicModel } from '../config/providers'
import { Env, GenericPayload } from '../interfaces/general'
import { createResponse } from './response'
import { logger } from './logger'

export interface ModelMappingResult {
  mappedModel: string
  updatedPayload: GenericPayload
}

export interface ModelMappingError {
  error: true
  response: Response
}

export function isModelMappingError(
  result: ModelMappingResult | ModelMappingError
): result is ModelMappingError {
  return 'error' in result && result.error === true
}

export function resolveGatewayModel(
  env: Env,
  payload: GenericPayload
): ModelMappingResult | ModelMappingError {
  const log = logger.withEnv(env)

  const payloadModel = payload.model as string
  const envMap = {
    ANTHROPIC_OPUS_MODEL: env.ANTHROPIC_OPUS_MODEL,
    ANTHROPIC_SONNET_MODEL: env.ANTHROPIC_SONNET_MODEL,
    ANTHROPIC_HAIKU_MODEL: env.ANTHROPIC_HAIKU_MODEL,
    ANTHROPIC_DEFAULT_MODEL: env.ANTHROPIC_DEFAULT_MODEL,
  }

  const mappedModel = resolveAnthropicModel(envMap, payloadModel)
  if (mappedModel === '') {
    return {
      error: true,
      response: new Response(
        JSON.stringify(createResponse(false, null, 'Mapped model is empty')),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      ),
    }
  }

  log.info(`payloadmodel ${payloadModel} mappedmodel ${mappedModel}`)

  if (mappedModel === payloadModel) {
    log.info(`Using model "${payloadModel}" from request without proxy mapping`)
    return {
      error: true,
      response: new Response(
        JSON.stringify(
          createResponse(
            false,
            null,
            `Model "${payloadModel}" is not mapped to a gateway model. Please specify a model alias in the request body that maps to a supported gateway model.`
          )
        ),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      ),
    }
  }

  log.info(`Mapped Claude model "${payloadModel}" -> "${mappedModel}"`)
  const updatedPayload = { ...payload }
  const modelName = mappedModel.slice(mappedModel.indexOf('/') + 1)
  updatedPayload.model = modelName

  return { mappedModel, updatedPayload }
}
