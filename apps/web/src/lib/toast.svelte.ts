export interface ToastItem {
  id: number
  message: string
  kind: 'info' | 'error'
}

let nextId = 0

export const toastState = $state<{ items: ToastItem[] }>({ items: [] })

export function toast(message: string, kind: 'info' | 'error' = 'info'): void {
  const id = ++nextId
  toastState.items.push({ id, message, kind })
  setTimeout(() => dismiss(id), 4000)
}

export function dismiss(id: number): void {
  const index = toastState.items.findIndex((t) => t.id === id)
  if (index !== -1) toastState.items.splice(index, 1)
}
