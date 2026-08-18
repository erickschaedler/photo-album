import { render, screen } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import InviteForm from './InviteForm.svelte'
import { acceptInvite } from '$lib/api/invites'
import { ApiError } from '$lib/api/client'

vi.mock('$lib/api/invites', () => ({ acceptInvite: vi.fn() }))

const session = {
  user: { id: 'u2', name: 'Ana', email: 'a@x.co' },
  space: { id: 's1', name: 'Nós dois', role: 'member' as const },
}

// Corpo em bloco de propósito: arrow com retorno implícito devolveria o mock
// (chainable) e o vitest trataria o retorno de beforeEach como cleanup,
// reinvocando acceptInvite() após o teste (bug descoberto na Task 5)
beforeEach(() => {
  vi.mocked(acceptInvite).mockReset()
})

describe('InviteForm', () => {
  it('aceita o convite com o token recebido e chama onSuccess', async () => {
    vi.mocked(acceptInvite).mockResolvedValue(session)
    const onSuccess = vi.fn()
    render(InviteForm, { token: 'tok123', onSuccess })
    await userEvent.type(screen.getByLabelText('Seu nome'), 'Ana')
    await userEvent.type(screen.getByLabelText('E-mail'), 'a@x.co')
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-forte')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar no espaço' }))
    expect(acceptInvite).toHaveBeenCalledWith('tok123', {
      name: 'Ana',
      email: 'a@x.co',
      password: 'senha-forte',
    })
    expect(onSuccess).toHaveBeenCalledWith(session)
  })

  it('mostra erro quando o e-mail já está em uso', async () => {
    vi.mocked(acceptInvite).mockRejectedValue(
      new ApiError(409, 'email_in_use', 'E-mail já cadastrado'),
    )
    render(InviteForm, { token: 'tok123', onSuccess: vi.fn() })
    await userEvent.type(screen.getByLabelText('Seu nome'), 'Ana')
    await userEvent.type(screen.getByLabelText('E-mail'), 'a@x.co')
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-forte')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar no espaço' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail já cadastrado')
  })
})
