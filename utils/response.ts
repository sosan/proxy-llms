import type { HonoRequest } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { ApiResponse, GenericPayload } from '../interfaces/general'

/**
 * Standard API Response Contract
 */
export const createResponse = <T>(success: boolean, data: T | null, error: string | null = null): ApiResponse<T> => ({
  success,
  data,
  error,
  timestamp: new Date().toISOString()
})

// --- Adapted for Durable Objects ---
// This function takes a Request object and returns a parsed payload or an error.
// Modified to accept HonoRequest as well, by using request.json() which is available on both.
export const parseRequestBody = async (request: Request | HonoRequest): Promise<{ payload: GenericPayload; error?: undefined; status?: undefined } | { error: string; status: ContentfulStatusCode; payload?: undefined }> => {
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
