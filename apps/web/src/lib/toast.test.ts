import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dismiss, toast, toastState } from './toast.svelte'

beforeEach(() => {
  vi.useFakeTimers()
  toastState.items.length = 0
})
afterEach(() => vi.useRealTimers())

describe('toast', () => {
  it('adiciona item e some sozinho depois de 4s', () => {
    toast('Convite copiado')
    expect(toastState.items).toHaveLength(1)
    expect(toastState.items[0]).toMatchObject({ message: 'Convite copiado', kind: 'info' })
    vi.advanceTimersByTime(4000)
    expect(toastState.items).toHaveLength(0)
  })

  it('dismiss remove um item específico sem afetar os outros', () => {
    toast('um')
    toast('dois', 'error')
    const first = toastState.items[0]!.id
    dismiss(first)
    expect(toastState.items).toHaveLength(1)
    expect(toastState.items[0]).toMatchObject({ message: 'dois', kind: 'error' })
  })
})
