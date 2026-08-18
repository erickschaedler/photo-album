import { render, screen } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SetupForm from './SetupForm.svelte'
import { runSetup } from '$lib/api/setup'

vi.mock('$lib/api/setup', () => ({ runSetup: vi.fn() }))

const session = {
  user: { id: 'u1', name: 'Erick', email: 'e@x.co' },
  space: { id: 's1', name: 'Nós dois', role: 'owner' as const },
}

beforeEach(() => vi.mocked(runSetup).mockReset())

describe('SetupForm', () => {
  it('cria a conta e o espaço e chama onSuccess', async () => {
    vi.mocked(runSetup).mockResolvedValue(session)
    const onSuccess = vi.fn()
    render(SetupForm, { onSuccess })
    await userEvent.type(screen.getByLabelText('Seu nome'), 'Erick')
    await userEvent.type(screen.getByLabelText('Nome do espaço'), 'Nós dois')
    await userEvent.type(screen.getByLabelText('E-mail'), 'e@x.co')
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-forte')
    await userEvent.click(screen.getByRole('button', { name: 'Começar o álbum' }))
    expect(runSetup).toHaveBeenCalledWith({
      name: 'Erick',
      spaceName: 'Nós dois',
      email: 'e@x.co',
      password: 'senha-forte',
    })
    expect(onSuccess).toHaveBeenCalledWith(session)
  })
})
