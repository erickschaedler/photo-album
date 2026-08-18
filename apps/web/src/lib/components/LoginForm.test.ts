import { render, screen } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoginForm from './LoginForm.svelte'
import { login } from '$lib/api/auth'
import { ApiError } from '$lib/api/client'

vi.mock('$lib/api/auth', () => ({ login: vi.fn() }))

const session = {
  user: { id: 'u1', name: 'Erick', email: 'e@x.co' },
  space: { id: 's1', name: 'Nós dois', role: 'owner' as const },
}

beforeEach(() => {
  // Corpo em bloco de propósito: `mockReset()` retorna o próprio mock (chainable) e o
  // Vitest trata qualquer função retornada por `beforeEach` como um cleanup pós-teste,
  // chamando-a de novo sem argumentos depois do teste. Com arrow function de expressão
  // (`() => vi.mocked(login).mockReset()`), isso reinvoca `login()` após o teste 2 contra
  // o mock ainda rejeitado, e a rejeição não tratada por ninguém derruba o teste.
  vi.mocked(login).mockReset()
})

describe('LoginForm', () => {
  it('envia credenciais e chama onSuccess com a sessão', async () => {
    vi.mocked(login).mockResolvedValue(session)
    const onSuccess = vi.fn()
    render(LoginForm, { onSuccess })
    await userEvent.type(screen.getByLabelText('E-mail'), 'e@x.co')
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-forte')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(login).toHaveBeenCalledWith({ email: 'e@x.co', password: 'senha-forte' })
    expect(onSuccess).toHaveBeenCalledWith(session)
  })

  it('mostra a mensagem da API quando as credenciais são inválidas', async () => {
    vi.mocked(login).mockRejectedValue(
      new ApiError(401, 'invalid_credentials', 'E-mail ou senha incorretos'),
    )
    const onSuccess = vi.fn()
    render(LoginForm, { onSuccess })
    await userEvent.type(screen.getByLabelText('E-mail'), 'e@x.co')
    await userEvent.type(screen.getByLabelText('Senha'), 'errada!!')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha incorretos')
    expect(onSuccess).not.toHaveBeenCalled()
  })
})
