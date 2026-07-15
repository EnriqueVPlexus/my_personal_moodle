import '@testing-library/jest-dom/vitest'
import React from 'react'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

const nextRouterMock = vi.hoisted(() => ({
  asPath: '/',
  pathname: '/',
  push: vi.fn(),
  replace: vi.fn(),
  query: {} as Record<string, unknown>
}))

;(globalThis as any).__NEXT_ROUTER_MOCK__ = nextRouterMock

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => React.createElement('a', { href, ...props }, children)
}))

vi.mock('next/router', () => ({
  useRouter: () => nextRouterMock
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  nextRouterMock.asPath = '/'
  nextRouterMock.pathname = '/'
  nextRouterMock.query = {}
  nextRouterMock.push.mockReset()
  nextRouterMock.replace.mockReset()
})
