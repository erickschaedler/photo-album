import { render, screen } from '@testing-library/svelte'
import { describe, expect, it } from 'vitest'
import Carregando from './Carregando.svelte'

describe('Carregando', () => {
  it('anuncia estado de carregamento acessível', () => {
    render(Carregando)
    expect(screen.getByRole('status')).toHaveTextContent('Carregando…')
  })
})
