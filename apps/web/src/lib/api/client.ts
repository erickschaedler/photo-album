import type { ApiErrorBody } from '@photo-album/shared'

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, init)
  } catch {
    throw new ApiError(0, 'network_error', 'Sem conexão. Verifique a internet e tente de novo.')
  }
  if (!res.ok) {
    let code = 'internal_error'
    let message = 'Erro inesperado. Tente de novo.'
    try {
      const body = (await res.json()) as ApiErrorBody
      code = body.error.code
      message = body.error.message
    } catch {
      // corpo não-JSON (ex.: HTML de erro do proxy) — mantém o genérico
    }
    throw new ApiError(res.status, code, message)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export function postJson<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function patchJson<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function del(path: string): Promise<void> {
  return apiFetch<void>(path, { method: 'DELETE' })
}
