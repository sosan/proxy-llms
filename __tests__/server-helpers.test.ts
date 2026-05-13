import { describe, it, expect } from 'vitest'
import { createResponse, parseRequestBody } from '../server.ts'
import { HonoRequest } from 'hono'

describe('createResponse', () => {
  it('should create a successful response with data', () => {
    const response = createResponse(true, { id: '123', name: 'test' })

    expect(response.success).toBe(true)
    expect(response.data).toEqual({ id: '123', name: 'test' })
    expect(response.error).toBeNull()
    expect(response.timestamp).toBeDefined()
    expect(new Date(response.timestamp).getTime()).toBeLessThanOrEqual(Date.now())
  })

  it('should create an error response', () => {
    const response = createResponse(false, null, 'Something went wrong')

    expect(response.success).toBe(false)
    expect(response.data).toBeNull()
    expect(response.error).toBe('Something went wrong')
    expect(response.timestamp).toBeDefined()
  })

  it('should create a response with null error when no error is provided', () => {
    const response = createResponse(true, { ok: true })

    expect(response.error).toBeNull()
  })

  it('should generate a valid ISO timestamp', () => {
    const response = createResponse(true, {})
    const timestamp = new Date(response.timestamp)

    expect(timestamp.toISOString()).toBe(response.timestamp)
    expect(isNaN(timestamp.getTime())).toBe(false)
  })
})

describe('parseRequestBody', () => {
  it('should parse a valid JSON body', async () => {
    const request = new Request('https://example.com/api', {
      method: 'POST',
      body: JSON.stringify({ provider: 'openai', model: 'gpt-4o' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const result = await parseRequestBody(request)

    expect(result.error).toBeUndefined()
    expect(result.payload).toBeDefined()
    expect(result.payload?.provider).toBe('openai')
    expect(result.payload?.model).toBe('gpt-4o')
  })

  it('should return error for invalid JSON', async () => {
    const request = new Request('https://example.com/api', {
      method: 'POST',
      body: 'not valid json',
      headers: { 'Content-Type': 'application/json' },
    })

    const result = await parseRequestBody(request)

    expect(result.error).toBeDefined()
    expect(result.status).toBe(400)
    expect(result.payload).toBeUndefined()
  })

  it('should return error for null body', async () => {
    const request = new Request('https://example.com/api', {
      method: 'POST',
      body: JSON.stringify(null),
      headers: { 'Content-Type': 'application/json' },
    })

    const result = await parseRequestBody(request)

    expect(result.error).toBeDefined()
    expect(result.status).toBe(400)
  })

  it('should handle payload with messages array', async () => {
    const body = {
      provider: 'openai',
      messages: [{ role: 'user', content: 'Hello' }],
    }

    const request = new Request('https://example.com/api', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    })

    const result = await parseRequestBody(request)

    expect(result.error).toBeUndefined()
    expect(result.payload?.messages).toEqual([{ role: 'user', content: 'Hello' }])
  })

  it('should handle payload with content string', async () => {
    const body = {
      provider: 'openai',
      content: 'Simple prompt',
    }

    const request = new Request('https://example.com/api', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    })

    const result = await parseRequestBody(request)

    expect(result.error).toBeUndefined()
    expect(result.payload?.content).toBe('Simple prompt')
  })

  it('should handle HonoRequest with valid JSON', async () => {
    // Mock HonoRequest with json() method
    const mockHonoRequest = {
      json: async () => ({ provider: 'claude', model: 'claude-3-sonnet' }),
    } as unknown as HonoRequest

    const result = await parseRequestBody(mockHonoRequest)

    expect(result.error).toBeUndefined()
    expect(result.payload?.provider).toBe('claude')
  })
})
