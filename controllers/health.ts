import { createResponse } from '../utils/response'

export const handleHealth = (c: any) => {
  return c.json(createResponse(true, {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  }))
}
