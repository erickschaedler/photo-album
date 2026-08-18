export function encodeCursor(takenAt: number, id: string): string {
  const json = JSON.stringify([takenAt, id])
  return btoa(json).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

export function decodeCursor(cursor: string): { takenAt: number; id: string } | null {
  try {
    const json = atob(cursor.replaceAll('-', '+').replaceAll('_', '/'))
    const parsed: unknown = JSON.parse(json)
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 2 ||
      typeof parsed[0] !== 'number' ||
      typeof parsed[1] !== 'string'
    )
      return null
    return { takenAt: parsed[0], id: parsed[1] }
  } catch {
    return null
  }
}
