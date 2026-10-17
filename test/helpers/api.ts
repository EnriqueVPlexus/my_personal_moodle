import { vi } from 'vitest'

export function createRequest(options: Record<string, any> = {}) {
  return {
    method: 'GET',
    headers: {},
    query: {},
    body: {},
    socket: { remoteAddress: '127.0.0.1' },
    ...options
  } as any
}

export function createResponse() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, unknown>,
    body: undefined,
    status: vi.fn((code: number) => {
      res.statusCode = code
      return res
    }),
    json: vi.fn((body: unknown) => {
      res.body = body
      return res
    }),
    end: vi.fn((body?: unknown) => {
      res.body = body
      return res
    }),
    setHeader: vi.fn((name: string, value: unknown) => {
      res.headers[name] = value
      return res
    })
  }

  return res
}

/**
 * Hand-written fake databases only mock get/all/run. `transaction` just runs
 * the work against the same fake so handler tests keep asserting call order.
 */
export function withFakeTransaction<T extends object>(db: T): T {
  return Object.assign(db, { transaction: (work: (tx: T) => Promise<unknown>) => work(db) })
}
