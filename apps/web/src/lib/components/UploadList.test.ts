import { render, screen } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { UploadItem } from '$lib/upload/queue.svelte'
import UploadList from './UploadList.svelte'

function item(overrides: Partial<UploadItem>): UploadItem {
  return {
    id: 1,
    file: new File(['x'], 'praia.jpg', { type: 'image/jpeg' }),
    status: 'queued',
    ...overrides,
  }
}

describe('UploadList', () => {
  it('mostra nome do arquivo e status traduzido', () => {
    render(UploadList, {
      items: [item({ id: 1, status: 'uploading' }), item({ id: 2, status: 'done' })],
      onRetry: vi.fn(),
    })
    expect(screen.getAllByText('praia.jpg')).toHaveLength(2)
    expect(screen.getByText('Enviando…')).toBeInTheDocument()
    expect(screen.getByText('Enviada')).toBeInTheDocument()
  })

  it('item com erro ganha botão "Tentar de novo" que chama onRetry com o id', async () => {
    const onRetry = vi.fn()
    render(UploadList, {
      items: [item({ id: 7, status: 'error', error: 'Arquivo grande demais' })],
      onRetry,
    })
    expect(screen.getByText('Falhou')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(onRetry).toHaveBeenCalledWith(7)
  })
})
