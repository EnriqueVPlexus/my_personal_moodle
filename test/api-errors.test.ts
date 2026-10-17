import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_HANDLER_MARKER, INTERNAL_ERROR_MESSAGE, isApiHandler, withApiErrors } from '../lib/http/errors'
import { createRequest, createResponse } from './helpers/api'

describe('withApiErrors', () => {
  let consoleError: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('marks the wrapper and keeps it callable', () => {
    const wrapped = withApiErrors(() => undefined)
    expect(wrapped[API_HANDLER_MARKER]).toBe(true)
    expect(isApiHandler(wrapped)).toBe(true)
    expect(isApiHandler(() => undefined)).toBe(false)
    expect(isApiHandler(undefined)).toBe(false)
  })

  it('does not touch intentional responses', async () => {
    const res = createResponse()
    await withApiErrors((_req, response) => {
      response.status(404).json({ error: 'No existe.' })
    })(createRequest(), res)

    expect(res.statusCode).toBe(404)
    expect(res.body).toEqual({ error: 'No existe.' })
    expect(res.json).toHaveBeenCalledTimes(1)
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('answers 500 JSON when a handler throws before writing, and logs method and route', async () => {
    const res = createResponse()
    const error = new Error('relation "users" does not exist')
    await withApiErrors(() => {
      throw error
    })(createRequest({ method: 'POST', url: '/api/users?token=abc' }), res)

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: INTERNAL_ERROR_MESSAGE })
    expect(JSON.stringify(res.body)).not.toContain('relation')
    expect(consoleError).toHaveBeenCalledTimes(1)
    const [message, logged] = consoleError.mock.calls[0]
    expect(message).toContain('POST /api/users')
    expect(message).not.toContain('token=abc')
    expect(logged).toBe(error)
  })

  it('handles rejected promises from async handlers', async () => {
    const res = createResponse()
    await withApiErrors(async () => {
      await Promise.resolve()
      throw new Error('boom')
    })(createRequest(), res)

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: INTERNAL_ERROR_MESSAGE })
  })

  it.each([['a string', 'boom'], ['undefined', undefined], ['null', null], ['an object', { code: 'X' }], ['a number', 42]])(
    'handles a thrown non-Error value (%s)',
    async (_name, value) => {
      const res = createResponse()
      await withApiErrors(() => {
        throw value
      })(createRequest(), res)

      expect(res.statusCode).toBe(500)
      expect(res.body).toEqual({ error: INTERNAL_ERROR_MESSAGE })
      expect(consoleError.mock.calls[0][1]).toBe(value)
    }
  )

  it('does not write again when the headers were already sent', async () => {
    const res = createResponse()
    await withApiErrors((_req, response) => {
      response.status(200).json({ ok: true })
      ;(response as any).headersSent = true
      throw new Error('late failure')
    })(createRequest(), res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect(res.status).toHaveBeenCalledTimes(1)
    expect(res.json).toHaveBeenCalledTimes(1)
    expect(consoleError).toHaveBeenCalledTimes(1)
  })

  it('survives a failure while writing the 500', async () => {
    const res = createResponse()
    res.status = vi.fn(() => {
      throw new Error('socket closed')
    })

    await expect(
      withApiErrors(() => {
        throw new Error('boom')
      })(createRequest(), res)
    ).resolves.toBeUndefined()
    expect(consoleError).toHaveBeenCalledTimes(2)
  })

  it('returns what the handler returns', async () => {
    const result = await withApiErrors(() => 'done')(createRequest(), createResponse())
    expect(result).toBe('done')
  })
})
