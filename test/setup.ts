import '@testing-library/jest-dom/vitest'
import React from 'react'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => React.createElement('a', { href, ...props }, children)
}))

vi.mock('next/router', () => ({
  useRouter: () => ({
    asPath: '/',
    pathname: '/',
    push: vi.fn(),
    query: {}
  })
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
