import { describe, it, expect } from 'vitest'
import { handleProbe } from '../../controllers/probe'

describe('handleProbe', () => {
  it('should return 204 with Allow header for given methods', async () => {
    const allowMethods = 'POST, HEAD, OPTIONS'
    const handler = handleProbe(allowMethods)

    const response = await handler({} as any)

    expect(response.status).toBe(204)
    expect(response.headers.get('Allow')).toBe(allowMethods)
  })

  it('should return empty body', async () => {
    const handler = handleProbe('GET, HEAD, OPTIONS')

    const response = await handler({} as any)

    expect(response.body).toBe(null)
  })
})
