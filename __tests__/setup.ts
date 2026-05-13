import { vi } from 'vitest'

interface GlobalWithCrypto {
  crypto?: {
    randomUUID?: () => string
    [key: string]: unknown
  }
}

// Mock crypto.randomUUID for Node.js environment
const g = globalThis as unknown as GlobalWithCrypto

if (!g.crypto?.randomUUID) {
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      ...g.crypto,
      randomUUID: () => 'test-uuid-1234-5678-90ab-cdef12345678',
    },
    writable: true,
    configurable: true,
  })
}

// Ensure crypto.randomUUID is always available
const currentCrypto = (globalThis as unknown as GlobalWithCrypto).crypto!
Object.defineProperty(currentCrypto, 'randomUUID', {
  value: () => 'test-uuid-1234-5678-90ab-cdef12345678',
  writable: true,
  configurable: true,
})
